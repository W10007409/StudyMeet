import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * Prisma 7 은 런타임에 드라이버 어댑터를 요구한다. url 만으로는 생성되지 않는다.
 * 클라이언트를 만드는 곳은 여기 하나뿐이다.
 */
export function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL 이 없다')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
