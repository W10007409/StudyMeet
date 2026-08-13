import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { creditDelta } from '../domain/credit.js'
import { decideNudge, isNudgeable } from '../domain/nudge.js'
import type { PushSender } from '../push/sender.js'

interface Deps {
  prisma: PrismaClient
  /** FCM 자격증명이 없으면 null. 그 사실을 응답으로 정직하게 드러낸다. */
  pushSender: PushSender | null
}

const NoteBody = z.object({ note: z.string() })

const EndBody = z.object({
  note: z.string(),
  disconnectedSec: z.number().int().nonnegative(),
  reason: z.literal('NO_SHOW').optional(),
})

async function sendNotFound(reply: FastifyReply): Promise<void> {
  await reply.code(404).send({ error: '세션을 찾을 수 없다' })
}

export const sessionRoutes: FastifyPluginAsync<Deps> = async (app, { prisma, pushSender }) => {
  app.get<{ Params: { id: string } }>('/sessions/:id/readiness', async (request, reply) => {
    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply)

    // 아이 앱 프리체크 결과를 받는 경로가 아직 없다 (§9 오픈이슈 — 화상 서비스 쪽 REST).
    // 데이터가 없다는 사실을 숨기지 않고 정직하게 "확인 안 됨"을 돌려준다.
    return {
      cameraGranted: false,
      micGranted: false,
      networkOk: false,
      checkedAt: null,
    }
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/nudge', async (request, reply) => {
    const session = await prisma.session.findUnique({
      where: { id: request.params.id },
      include: {
        enrollment: { include: { student: true } },
        teacher: true,
      },
    })
    if (!session) return sendNotFound(reply)

    // 끝난 수업에 아이를 부르는 알림이 가서는 안 된다.
    if (!isNudgeable(session.status)) {
      return reply.code(409).send({ error: '부를 수 있는 상태의 세션이 아니다' })
    }

    const customerNumber = session.enrollment.student.customerNumber
    const devices = customerNumber
      ? await prisma.device.findMany({ where: { customerNumber } })
      : []

    let sent = 0
    let failed = 0

    if (pushSender !== null && devices.length > 0) {
      const result = await pushSender.send(devices.map((d) => d.token), {
        type: 'lesson_call',
        sessionId: session.id,
        teacherName: session.teacher.name,
        scheduledAt: session.scheduledAt.toISOString(),
      })
      sent = result.okTokens.length
      failed = result.invalidTokens.length + result.failedTokens.length

      // 죽은 토큰을 남겨 두면 아이가 앱을 지운 뒤에도 영영 "보냈다"가 나온다.
      if (result.invalidTokens.length > 0) {
        await prisma.device.deleteMany({ where: { token: { in: result.invalidTokens } } })
      }
    }

    const outcome = decideNudge({
      configured: pushSender !== null,
      customerNumber,
      deviceCount: devices.length,
      sent,
      failed,
    })

    request.log.info(
      { sessionId: session.id, customerNumber, deviceCount: devices.length, ...outcome },
      'nudge result',
    )
    return outcome
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/start', async (request, reply) => {
    // heartbeat 와 같은 이유로 읽고-쓰는 왕복 대신 상태 조건을 건 단일 updateMany 를 쓴다 —
    // 더블클릭·재시도로 거의 동시에 두 요청이 들어와도 먼저 조건을 통과한 하나만 startedAt 을 쓴다.
    const now = new Date()
    const result = await prisma.session.updateMany({
      where: { id: request.params.id, status: { in: ['SCHEDULED', 'LOBBY_OPEN'] } },
      data: { status: 'IN_PROGRESS', startedAt: now, lastHeartbeatAt: now },
    })
    if (result.count === 0) {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } })
      if (!session) return sendNotFound(reply)
      return reply.code(409).send({ error: '이미 시작됐거나 종료된 세션이다' })
    }
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/heartbeat', async (request, reply) => {
    // 초당 100회 규모로 들어온다. 읽고-쓰는 왕복 대신 상태 조건을 건 단일 updateMany 로
    // 처리하고, 영향 행 수로 결과를 판단한다 (읽기-쓰기 사이의 경합을 없앤다).
    const result = await prisma.session.updateMany({
      where: { id: request.params.id, status: 'IN_PROGRESS' },
      data: { lastHeartbeatAt: new Date() },
    })
    if (result.count === 0) {
      const session = await prisma.session.findUnique({ where: { id: request.params.id } })
      if (!session) return sendNotFound(reply)
      return reply.code(409).send({ error: '진행 중인 세션이 아니다' })
    }
    return reply.code(204).send()
  })

  app.put<{ Params: { id: string } }>('/sessions/:id/note', async (request, reply) => {
    const parsed = NoteBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply)

    await prisma.session.update({
      where: { id: session.id },
      data: { note: parsed.data.note },
    })
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/end', async (request, reply) => {
    const parsed = EndBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply)

    if (session.status !== 'SCHEDULED' && session.status !== 'IN_PROGRESS') {
      return reply.code(409).send({ error: '이미 처리된 세션이다' })
    }

    const { note, disconnectedSec, reason } = parsed.data
    const isNoShow = reason === 'NO_SHOW'

    // 노쇼 크레딧 발생. 원장(CreditEntry)과 잔액(Enrollment.creditBalance)이 어긋나면
    // 둘 중 무엇이 맞는지 아무도 알 수 없다 — 한 트랜잭션에서 같이 쓴다.
    await prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: {
          note,
          disconnectedSec,
          endedAt: new Date(),
          status: isNoShow ? 'NO_SHOW' : 'ENDED',
        },
      })

      if (isNoShow) {
        const delta = creditDelta('NO_SHOW')
        await tx.creditEntry.create({
          data: {
            enrollmentId: session.enrollmentId,
            delta,
            reason: 'NO_SHOW',
            sessionId: session.id,
          },
        })
        await tx.enrollment.update({
          where: { id: session.enrollmentId },
          data: { creditBalance: { increment: delta } },
        })
      }
    })

    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/sessions/:id/token', async (request, reply) => {
    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply)

    return {
      signalingUrl: process.env.SIGNALING_URL ?? 'ws://localhost:8080',
      room: session.id,
      role: 'caller' as const,
    }
  })
}
