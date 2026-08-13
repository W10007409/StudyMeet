import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { pickCurrentSession, type SessionCandidate } from '../domain/currentSession.js'
import { toKstIsoString } from '../domain/kst.js'

interface Deps {
  prisma: PrismaClient
}

async function sendNotFound(reply: FastifyReply): Promise<void> {
  // 남의 방이 존재한다는 사실조차 알려주지 않는다. 없는 것과 같은 응답을 준다.
  await reply.code(404).send({ error: '들어갈 수 있는 수업이 없다' })
}

export const studentRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  // 인증이 없다. 회원번호만 알면 그 아이의 수업 정보가 나온다 — 설계 §7-1 의 열린 이슈다.
  app.get<{ Params: { customerNumber: string }; Querystring: { sessionId?: string } }>(
    '/students/:customerNumber/current-session',
    async (request, reply) => {
      const { customerNumber } = request.params
      const { sessionId } = request.query

      const student = await prisma.student.findUnique({ where: { customerNumber } })
      if (!student) return sendNotFound(reply)

      // 소유권 확인은 이 where 절이 한다 — 다른 아이의 세션은 애초에 후보에 들어오지 않는다.
      const sessions = await prisma.session.findMany({
        where: {
          enrollment: { studentId: student.id },
          ...(sessionId ? { id: sessionId } : {}),
        },
        include: { teacher: true },
      })

      const candidates: SessionCandidate[] = sessions.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        status: s.status,
      }))

      const picked = pickCurrentSession(candidates, new Date())
      if (!picked) return sendNotFound(reply)

      const session = sessions.find((s) => s.id === picked.id)!

      return {
        sessionId: session.id,
        signalingUrl: process.env.SIGNALING_URL ?? 'ws://127.0.0.1:8081',
        room: session.id,
        // 선생님이 caller 다. 아이는 offer 를 기다린다 (설계 §3.1).
        role: 'callee' as const,
        teacherName: session.teacher.name,
        // 클라이언트가 slice(11, 16) 으로 시각을 읽으므로 +09:00 오프셋이 필요하다. UTC 반환은 9시간 어긋난다.
        scheduledAt: toKstIsoString(session.scheduledAt),
      }
    },
  )
}
