import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createPrisma } from './db.js'
import { teacherRoutes } from './routes/teacher.js'
import { sessionRoutes } from './routes/session.js'
import { contactRoutes } from './routes/contact.js'
import { makeupRoutes } from './routes/makeup.js'

const prisma = createPrisma()
const app = Fastify({ logger: true })

// teacher-web(Vite) 은 다른 포트에서 뜨므로 브라우저가 CORS 로 막는다.
// '*' 로 열지 않는다 — 배포 환경은 반드시 CORS_ORIGIN 을 실제 도메인으로 설정해야 한다.
// @fastify/cors 의 기본 methods 는 'GET,HEAD,POST' 뿐이라 PUT(saveNote)이 막힌다 —
// 실제 브라우저로 검증하다 잡은 문제라 명시적으로 다 나열한다.
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT'],
})

app.register(teacherRoutes, { prisma })
app.register(sessionRoutes, { prisma })
app.register(contactRoutes, { prisma })
app.register(makeupRoutes, { prisma })

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

const port = Number(process.env.PORT ?? 3000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
