import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient, SessionStatus } from '@prisma/client'
import { z } from 'zod'
import { toKstIsoString } from '../domain/kst.js'

interface Deps {
  prisma: PrismaClient
}

const ListQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 는 YYYY-MM-DD 형식이어야 한다'),
})

/**
 * 배치(materialize)는 세션을 SCHEDULED 로만 만든다. LOBBY_OPEN 으로 옮기는 배치가 없으므로
 * 여기서 조회 시점에 계산한다 — 설계 §4의 "시작 5분 전부터 대기실" 규칙.
 * ENDED/CANCELLED/NO_SHOW 처럼 확정된 상태는 그대로 돌려준다.
 */
function displayStatus(status: SessionStatus, scheduledAt: Date, now: Date): SessionStatus {
  if (status !== 'SCHEDULED') return status
  const lobbyOpensAt = scheduledAt.getTime() - 5 * 60 * 1000
  return now.getTime() >= lobbyOpensAt ? 'LOBBY_OPEN' : 'SCHEDULED'
}

export const teacherRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  app.get<{ Params: { id: string }; Querystring: { date?: string } }>(
    '/teacher/:id/sessions',
    async (request, reply) => {
      const parsed = ListQuery.safeParse(request.query)
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues })
      }
      const { date } = parsed.data
      const teacherId = request.params.id

      const dayStart = new Date(`${date}T00:00:00+09:00`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

      const sessions = await prisma.session.findMany({
        where: {
          teacherId,
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        include: { enrollment: { include: { student: true } } },
        orderBy: { scheduledAt: 'asc' },
      })

      const now = new Date()
      return sessions.map((s) => ({
        sessionId: s.id,
        studentName: s.enrollment.student.name,
        studentId: s.enrollment.studentId,
        scheduledAt: toKstIsoString(s.scheduledAt),
        durationMin: s.durationMin,
        bookTitle: s.enrollment.bookTitle,
        status: displayStatus(s.status, s.scheduledAt, now),
      }))
    },
  )
}
