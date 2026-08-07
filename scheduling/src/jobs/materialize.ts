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

/** UTC 타임스탬프를 KST 날짜 문자열로 바꾼다. expandRule 이 쓰는 단위와 맞춘다. */
function toKstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 설계 §3.1 — 4주치를 미리 행으로 만든다. */
export async function materialize(prisma: PrismaClient, today: string): Promise<number> {
  const until = new Date(`${today}T00:00:00Z`)
  // WEEKS_AHEAD * 7 일을 더하면 오늘부터 4주가 아니라 4주+1일이 된다.
  // expandRule 의 끝은 포함이므로 하루를 빼서 정확히 4주 창을 만든다.
  until.setUTCDate(until.getUTCDate() + WEEKS_AHEAD * 7 - 1)
  const toDate = until.toISOString().slice(0, 10)

  const holidays = (await prisma.holiday.findMany()).map((h) => h.date)
  const rules = await prisma.recurrenceRule.findMany({ include: { enrollment: true } })

  let created = 0

  for (const rule of rules) {
    // 규칙 자신의 활성 구간으로 창을 좁힌다 — 끝난 규칙이 영원히 만들어내거나,
    // 아직 시작 안 한 규칙이 오늘부터 만들어내는 일을 막는다. 단위는 KST 날짜.
    const startsOnKst = toKstDate(rule.startsOn)
    const endsOnKst = rule.endsOn ? toKstDate(rule.endsOn) : null

    const fromDate = startsOnKst > today ? startsOnKst : today
    const ruleToDate = endsOnKst && endsOnKst < toDate ? endsOnKst : toDate

    if (fromDate > ruleToDate) continue // 활성 구간이 이 창과 겹치지 않는다

    const wanted = expandRule(
      { weekdays: rule.weekdays, time: rule.time },
      fromDate,
      ruleToDate,
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
