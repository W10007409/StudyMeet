import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'

interface Deps {
  prisma: PrismaClient
}

export const contactRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  app.post<{ Params: { studentId: string } }>('/contacts/:studentId/reveal', async (request, reply) => {
    const student = await prisma.student.findUnique({ where: { id: request.params.studentId } })
    if (!student) return reply.code(404).send({ error: '학생을 찾을 수 없다' })

    // 열람은 기록되어야 한다 (설계 §6.2). 열람 기록 테이블은 아직 없으므로
    // (이 계획 범위 밖) 지금은 구조화 로그로 남긴다 — 나중에 감사가 필요해지면
    // 이 로그를 테이블로 승격하면 된다.
    request.log.info({ studentId: student.id, at: new Date().toISOString() }, 'contact reveal')

    return { phone: student.guardianPhone }
  })
}
