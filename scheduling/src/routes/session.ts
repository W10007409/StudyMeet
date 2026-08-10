import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { creditDelta } from '../domain/credit.js'

interface Deps {
  prisma: PrismaClient
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

export const sessionRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
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
    const session = await prisma.session.findUnique({ where: { id: request.params.id } })
    if (!session) return sendNotFound(reply)

    // FCM 연동은 이 계획 범위 밖이다. 도달 실패를 성공으로 바꾸지 않는다 —
    // 선생님 화면이 이 값을 보고 "알림이 전달되지 않았어요"를 띄운다.
    request.log.warn({ sessionId: session.id }, 'nudge: FCM not configured, notification not sent')
    return { delivered: false, reason: 'FCM_NOT_CONFIGURED' }
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
