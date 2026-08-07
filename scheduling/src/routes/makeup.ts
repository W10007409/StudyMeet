import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import { Prisma, type PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canCancel } from '../domain/deadline.js'
import { creditDelta, shouldWarn } from '../domain/credit.js'
import { slotsOfDay, isValidSlot } from '../domain/slots.js'

interface Deps {
  prisma: PrismaClient
}

async function sendNotFound(reply: FastifyReply, message: string): Promise<void> {
  await reply.code(404).send({ error: message })
}

/** UTC 타임스탬프를 KST 'YYYY-MM-DD' / 'HH:MM' 로 나눈다. materialize.ts 의 변환 관례를 따른다. */
function toKst(d: Date): { date: string; time: string } {
  const kstIso = new Date(d.getTime() + 9 * 3600_000).toISOString()
  return { date: kstIso.slice(0, 10), time: kstIso.slice(11, 16) }
}

/** from~to (포함) 사이의 KST 날짜 문자열 목록. recurrence.ts 의 날짜 순회 방식과 같다. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor.getTime() <= end.getTime()) {
    out.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

/** 트랜잭션 안에서 잔액 조건부 차감이 0건이면 이걸 던진다 — $transaction 이 전체를 롤백한다. */
class InsufficientCreditError extends Error {}

const MakeupSlotsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from 은 YYYY-MM-DD 형식이어야 한다'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to 는 YYYY-MM-DD 형식이어야 한다'),
})

const MakeupBody = z.object({
  enrollmentId: z.string().min(1),
  scheduledAt: z.string().min(1),
})

export const makeupRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  /**
   * 설계 §4.2 — 하루 전(24시간)까지는 정상 취소, 그 이후는 노쇼.
   * 어느 쪽이든 크레딧은 동일하게 +1 이다 — 거절이 아니라 기록의 차이일 뿐이다.
   * 이미 처리된 세션(재취소)은 크레딧을 두 번 발생시키지 않도록 막는다.
   */
  app.post<{ Params: { id: string } }>('/sessions/:id/cancel', async (request, reply) => {
    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply, '세션을 찾을 수 없다')

    if (session.status !== 'SCHEDULED') {
      return reply.code(409).send({ error: '이미 처리된 세션이다' })
    }

    const now = new Date()
    const onTime = canCancel(session.scheduledAt, now)
    const newStatus = onTime ? 'CANCELLED' : 'NO_SHOW'
    // 구분 없는 단일 취소 경로이므로, 하루 전 취소는 "가족이 미리 알려온 결석"으로 본다.
    // 설계가 캐치올(catch-all) 사유를 명시하지 않아 STUDENT_ABSENT 를 골랐다 — 보고서에 기록.
    const creditEvent = onTime ? ('STUDENT_ABSENT' as const) : ('NO_SHOW' as const)
    const delta = creditDelta(creditEvent)

    const updated = await prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { status: newStatus },
      })
      await tx.creditEntry.create({
        data: {
          enrollmentId: session.enrollmentId,
          delta,
          reason: creditEvent,
          sessionId: session.id,
        },
      })
      return tx.enrollment.update({
        where: { id: session.enrollmentId },
        data: { creditBalance: { increment: delta } },
      })
    })

    return reply.code(200).send({
      status: newStatus,
      creditBalance: updated.creditBalance,
    })
  })

  /**
   * 그 기간의 빈 슬롯(slotsOfDay() 에서 이미 잡힌 Session 을 뺀 것)과
   * 담당 학생별 잔여 크레딧·경고를 함께 돌려준다 — 선생님은 둘 다 봐야 결정할 수 있다.
   * 슬롯 점유는 상태를 가리지 않는다: @@unique([teacherId, scheduledAt]) 는 상태와 무관하게
   * 그 시각의 행 존재 자체를 막으므로, 취소된 세션의 시각도 다시 못 쓴다.
   */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/teacher/:id/makeup-slots',
    async (request, reply) => {
      const parsed = MakeupSlotsQuery.safeParse(request.query)
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

      const { from, to } = parsed.data
      if (from > to) return reply.code(400).send({ error: 'from 이 to 보다 늦다' })

      const teacherId = request.params.id
      const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } })
      if (!teacher) return sendNotFound(reply, '선생님을 찾을 수 없다')

      const rangeStart = new Date(`${from}T00:00:00+09:00`)
      const rangeEnd = new Date(`${to}T00:00:00+09:00`)
      rangeEnd.setTime(rangeEnd.getTime() + 24 * 60 * 60 * 1000)

      const existing = await prisma.session.findMany({
        where: { teacherId, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
        select: { scheduledAt: true },
      })

      const used = new Map<string, Set<string>>()
      for (const date of dateRange(from, to)) used.set(date, new Set())
      for (const s of existing) {
        const { date, time } = toKst(s.scheduledAt)
        used.get(date)?.add(time)
      }

      const allSlots = slotsOfDay()
      const slots = dateRange(from, to).map((date) => ({
        date,
        times: allSlots.filter((t) => !used.get(date)?.has(t)),
      }))

      const enrollments = await prisma.enrollment.findMany({
        where: { teacherId },
        include: { student: true },
      })
      const students = enrollments.map((e) => ({
        enrollmentId: e.id,
        studentId: e.studentId,
        studentName: e.student.name,
        creditBalance: e.creditBalance,
        warn: shouldWarn(e.creditBalance),
      }))

      return { slots, students }
    },
  )

  /**
   * 크레딧 잔액 확인 → 세션 생성(isMakeup: true) → 크레딧 -1. 모두 한 트랜잭션.
   * 잔액 확인은 조건부 UPDATE(updateMany + creditBalance: { gt: 0 })로 한다 — 이 한 문장 자체가
   * Postgres 에서 원자적이므로, 동시에 들어온 두 요청이 마지막 크레딧 하나를 같이 쓸 수 없다.
   * 슬롯 중복은 여기서 읽은 값을 신뢰하지 않는다 — @@unique 위반(P2002)을 잡아 409 로 돌려준다.
   */
  app.post('/makeups', async (request, reply) => {
    const parsed = MakeupBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { enrollmentId, scheduledAt: scheduledAtRaw } = parsed.data
    const scheduledAt = new Date(scheduledAtRaw)
    if (Number.isNaN(scheduledAt.getTime())) {
      return reply.code(400).send({ error: 'scheduledAt 이 올바른 날짜가 아니다' })
    }

    const { time } = toKst(scheduledAt)
    if (!isValidSlot(time)) {
      return reply.code(400).send({ error: 'scheduledAt 이 슬롯 그리드 위에 있지 않다' })
    }

    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) return sendNotFound(reply, '담임 관계를 찾을 수 없다')

    try {
      const result = await prisma.$transaction(async (tx) => {
        const spent = await tx.enrollment.updateMany({
          where: { id: enrollmentId, creditBalance: { gt: 0 } },
          data: { creditBalance: { decrement: 1 } },
        })
        if (spent.count === 0) throw new InsufficientCreditError()

        const session = await tx.session.create({
          data: {
            enrollmentId,
            teacherId: enrollment.teacherId,
            scheduledAt,
            isMakeup: true,
          },
        })

        await tx.creditEntry.create({
          data: {
            enrollmentId,
            delta: creditDelta('MAKEUP_BOOKED'),
            reason: 'MAKEUP_BOOKED',
            sessionId: session.id,
          },
        })

        const updatedEnrollment = await tx.enrollment.findUniqueOrThrow({
          where: { id: enrollmentId },
        })

        return { session, creditBalance: updatedEnrollment.creditBalance }
      })

      return reply.code(201).send({
        sessionId: result.session.id,
        scheduledAt: result.session.scheduledAt.toISOString(),
        status: result.session.status,
        isMakeup: result.session.isMakeup,
        creditBalance: result.creditBalance,
      })
    } catch (err) {
      if (err instanceof InsufficientCreditError) {
        return reply.code(400).send({ error: '크레딧이 없다' })
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return reply.code(409).send({ error: '이미 예약된 슬롯이다' })
      }
      throw err
    }
  })
}
