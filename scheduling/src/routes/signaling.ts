import type { FastifyInstance } from 'fastify'
import type { WebSocketStream } from '@fastify/websocket'

interface Client {
  ws: WebSocketStream
  role?: 'caller' | 'callee'
  roomId: string
}

const rooms = new Map<string, Map<string, Client>>()

export async function signalingRoutes(app: FastifyInstance) {
  await app.register(import('@fastify/websocket'))

  app.get('/', { websocket: true }, (socket: WebSocketStream, req) => {
    const roomId = (req.query as any).room as string
    if (!roomId) {
      console.error('No room specified in query parameters')
      socket.close(1008, 'No room specified')
      return
    }
    const clientId = Math.random().toString(36).substring(7)

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map())
    }

    const room = rooms.get(roomId)!
    const client: Client = { ws: socket, roomId }
    room.set(clientId, client)

    console.log(`✅ Client ${clientId} connected to room ${roomId} (total: ${room.size})`)

    socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        const msgType = message.type
        if (msgType !== 'teacher_camera_frame' && msgType !== 'camera_frame' && msgType !== 'screen_frame') {
          console.log(`📨 [${roomId}] ${msgType} from ${clientId} (room size: ${room.size})`)
        }
        if (msgType === 'touch_input' || msgType === 'gesture_input') {
          console.log(`🖐️ TOUCH [${roomId}] ${msgType} x=${message.x} y=${message.y} action=${message.action} from ${clientId}`)
        }

        // Determine sender role based on first message
        if (message.type === 'ready' && !client.role) {
          client.role = 'callee'
          console.log(`✅ [${roomId}] ${clientId} is CALLEE`)
          // Notify caller that callee is ready
          room.forEach((c, id) => {
            if (id !== clientId && c.role === 'caller') {
              c.ws.send(JSON.stringify({ type: 'ready' }))
            }
          })
        } else if (message.type === 'offer' && !client.role) {
          client.role = 'caller'
          console.log(`✅ [${roomId}] ${clientId} is CALLER`)
        }

        // Relay ALL messages to the other client (as string, not Buffer)
        const strData = data.toString()
        let sentCount = 0
        room.forEach((c, id) => {
          if (id !== clientId) {
            c.ws.send(strData)
            sentCount++
          }
        })

        if (sentCount === 0) {
          console.warn(`⚠️ [${roomId}] No recipient for message from ${clientId}`)
        }
      } catch (err) {
        console.error(`Error processing message: ${err instanceof Error ? err.message : err}`)
      }
    })

    socket.on('error', (err: Error) => {
      console.error(`WebSocket error in room ${roomId}: ${err.message}`)
    })

    socket.on('close', () => {
      room.delete(clientId)
      console.log(`❌ Client ${clientId} disconnected from room ${roomId} (remaining: ${room.size})`)

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(roomId)
      }
    })
  })
}
