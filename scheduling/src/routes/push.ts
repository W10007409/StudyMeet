import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { FcmSender } from '../push/fcm.js'
import { z } from 'zod'

interface Deps {
  prisma: PrismaClient
  pushSender: FcmSender | null
}

const LessonRequestBody = z.object({
  customerNumber: z.string().min(1),
  roomCode: z.string().min(1),
  teacherName: z.string().optional().default('선생님'),
})

// 테스트용 임시 device 저장소
const testDevices: Record<string, string> = {
  'TEST-CHILD-001': 'eMfdK9sDTgiOltvKMiqaD6:APA91bHTAGMrK9xz0fXbegcyLU1dGzg0J2OegPmDJYvmVomtjbRhnaOLxB1rU13_n7_9WXrhfUeV6zkcQUO7eJ5Azr9QQQUQvfA08dCX7CEauhARr6bN0B0',
}

export const pushRoutes: FastifyPluginAsync<Deps> = async (app, { prisma, pushSender }) => {
  // 아이에게 수업 요청 푸시 발송
  app.post('/api/push/lesson-request', async (request, reply) => {
    const parsed = LessonRequestBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { customerNumber, roomCode, teacherName } = parsed.data

    // 테스트용: 메모리에서 token 조회
    const token = testDevices[customerNumber]

    if (!token) {
      return reply.code(404).send({
        error: 'Device not found for customer number: ' + customerNumber,
      })
    }

    // FCM 푸시 발송
    if (!pushSender) {
      return reply.code(503).send({
        error: 'Push notification service not configured',
      })
    }

    try {
      await pushSender.sendToToken(token, {
        notification: {
          title: '수업 요청',
          body: `${teacherName}이(가) 수업을 요청했습니다`,
        },
        data: {
          type: 'lesson_request',
          roomCode,
          teacherName,
        },
      })

      return reply.code(200).send({
        success: true,
        message: 'Push notification sent',
      })
    } catch (error) {
      app.log.error(error)
      return reply.code(500).send({
        error: 'Failed to send push notification',
      })
    }
  })
}
