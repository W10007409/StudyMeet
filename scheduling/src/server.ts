import Fastify from 'fastify'
import cors from '@fastify/cors'
import { createPrisma } from './db.js'
import { teacherRoutes } from './routes/teacher.js'
import { sessionRoutes } from './routes/session.js'
import { contactRoutes } from './routes/contact.js'
import { makeupRoutes } from './routes/makeup.js'
import { operatorRoutes } from './routes/operator.js'
import { requireOperatorSecret } from './middleware/operatorOnly.js'

// 운영자 API 는 전체 아동의 보호자 연락처와 모든 수업에 닿는데, 아직 진짜 인증이 없다
// (설계 §2.1). OPERATOR_SECRET 없이는 그 장치가 조용히 통과하는 채로 뜨게 되므로,
// 다른 무엇보다 먼저(Prisma 연결보다도 먼저) 확인해 없으면 서버를 아예 띄우지 않는다.
try {
  requireOperatorSecret()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}

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
app.register(operatorRoutes, { prisma })

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

const port = Number(process.env.PORT ?? 3000)
// 외부 인터페이스에 여는 것은 명시적 선택이어야 한다 (설계 §2.1) — 기본값은 loopback.
// 운영자 라우트가 시크릿 헤더만으로 지켜지므로, 이 서버가 LAN/공인망에 그대로 열리면
// 시크릿 하나가 전체 아동 개인정보의 마지막 방어선이 된다.
const host = process.env.HOST ?? '127.0.0.1'

app.listen({ port, host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
