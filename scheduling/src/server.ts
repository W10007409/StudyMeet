import Fastify from 'fastify'
import { createPrisma } from './db.js'
import { teacherRoutes } from './routes/teacher.js'
import { sessionRoutes } from './routes/session.js'
import { contactRoutes } from './routes/contact.js'

const prisma = createPrisma()
const app = Fastify({ logger: true })

app.register(teacherRoutes, { prisma })
app.register(sessionRoutes, { prisma })
app.register(contactRoutes, { prisma })

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

const port = Number(process.env.PORT ?? 3000)

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
