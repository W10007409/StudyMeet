import type { FastifyPluginAsync } from 'fastify'
import { AccessToken } from 'livekit-server-sdk'

const API_KEY = process.env.LIVEKIT_API_KEY || 'APILGwTtFgnnUkP'
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'jEXnYI8K6w9CbOZSpwusEyuteQ0wPzoxHHKOOxpw5TD'

export const livekitRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/livekit/token', async (request, reply) => {
    const { room, identity } = request.body as { room: string; identity: string; role?: string }

    if (!room || !identity) {
      return reply.code(400).send({ error: 'room and identity are required' })
    }

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      ttl: '2h',
    })

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
    })

    const token = await at.toJwt()
    return reply.send({ token })
  })
}
