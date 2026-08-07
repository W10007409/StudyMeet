import type { PrismaClient } from '@prisma/client'
import { expandRule } from '../domain/recurrence.js'

/**
 * 배치는 매일 돈다. 이미 있는 세션을 다시 만들면 선생님 메모와 누적 끊김이 날아간다.
 * 그래서 생성 대상에서 기존 날짜를 빼는 것이 이 배치의 전부다.
 */
export function sessionsToCreate(wanted: string[], existing: string[]): string[] {
  const have = new Set(existing)
  return wanted.filter((d) => !have.has(d))
}

const WEEKS_AHEAD = 4

/** 설계 §3.1 — 4주치를 미리 행으로 만든다. */
export async function materialize(prisma: PrismaClient, today: string): Promise<number> {
  const until = new Date(`${today}T00:00:00Z`)
  until.setUTCDate(until.getUTCDate() + WEEKS_AHEAD * 7)
  const toDate = until.toISOString().slice(0, 10)

  const holidays = (await prisma.holiday.findMany()).map((h) => h.date)
  const rules = await prisma.recurrenceRule.findMany({ include: { enrollment: true } })

  let created = 0

  for (const rule of rules) {
    const wanted = expandRule(
      { weekdays: rule.weekdays, time: rule.time },
      today,
      toDate,
      holidays,
    )

    const existing = await prisma.session.findMany({
      where: {
        enrollmentId: rule.enrollmentId,
        scheduledAt: { gte: new Date(`${today}T00:00:00+09:00`) },
        isMakeup: false,
      },
      select: { scheduledAt: true },
    })
    const existingDates = existing.map((s) =>
      new Date(s.scheduledAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10),
    )

    for (const date of sessionsToCreate(wanted, existingDates)) {
      await prisma.session.create({
        data: {
          enrollmentId: rule.enrollmentId,
          teacherId: rule.enrollment.teacherId,
          // 슬롯 시각은 KST 다. 설계의 경계 판정 규칙.
          scheduledAt: new Date(`${date}T${rule.time}:00+09:00`),
        },
      })
      created++
    }
  }

  return created
}
