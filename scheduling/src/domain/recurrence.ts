export interface RecurrenceRule {
  /** 0=일 … 6=토 */
  weekdays: number[]
  /** 'HH:MM', 슬롯 그리드 위여야 한다 */
  time: string
}

/**
 * 반복 규칙을 실제 날짜로 편다. 설계 §3.1.
 * 날짜만 다루고 시각은 건드리지 않는다 — 시각은 규칙에 이미 들어 있다.
 * 경계 판정은 전부 KST 기준이므로 여기서는 로컬 타임존에 의존하지 않는 순수 날짜 계산만 한다.
 */
export function expandRule(
  rule: RecurrenceRule,
  fromDate: string,
  toDate: string,
  holidays: string[],
): string[] {
  const holidaySet = new Set(holidays)
  const days = new Set(rule.weekdays)
  const out: string[] = []

  const cursor = new Date(`${fromDate}T00:00:00Z`)
  const end = new Date(`${toDate}T00:00:00Z`)

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10)
    // 공휴일에는 세션을 아예 만들지 않는다. 설계 §4.3
    if (days.has(cursor.getUTCDay()) && !holidaySet.has(iso)) out.push(iso)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return out
}
