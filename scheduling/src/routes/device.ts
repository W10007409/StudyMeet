import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

interface Deps {
  prisma: PrismaClient
}

export const DeviceBody = z.object({
  customerNumber: z.string().min(1),
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().optional(),
})

export const deviceRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  // 인증이 없다. 설계 §9-1 의 열린 이슈이며 운영 배포 전에 반드시 닫는다.
  app.post('/devices', async (request, reply) => {
    const parsed = DeviceBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { customerNumber, token, platform, appVersion } = parsed.data

    // 토큰이 기준이다. 같은 태블릿을 형제가 나눠 쓰면 마지막 등록이 이긴다 (설계 §4.2).
    await prisma.device.upsert({
      where: { token },
      create: { token, customerNumber, platform, appVersion },
      update: { customerNumber, platform, appVersion },
    })

    return reply.code(204).send()
  })
}
