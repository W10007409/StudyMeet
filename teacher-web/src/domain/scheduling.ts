import type { SessionSummary } from './types'

/** 편성 설계 §4.2 — 휴강 마감은 24시간. */
const CANCEL_LEAD_MS = 24 * 60 * 60 * 1000

/** 아직 일어나지 않은 수업만 휴강 대상이다. */
export function canRequestCancel(session: SessionSummary): boolean {
  return session.status === 'SCHEDULED' || session.status === 'LOBBY_OPEN'
}

/**
 * 마감을 넘겼는지 알려줄 뿐 막지 않는다.
 * 편성 설계 §4.2 — 늦은 취소도 크레딧은 동일하게 나가고, 기록만 노쇼가 된다.
 * 화면은 그 사실을 미리 보여주는 역할만 한다.
 */
export function isLateCancel(scheduledAt: string, now: Date): boolean {
  return new Date(scheduledAt).getTime() - now.getTime() < CANCEL_LEAD_MS
}

/**
 * KST 기준 오늘 날짜. `toISOString()` 은 UTC 라 한국 아침에 전날이 나온다.
 */
export function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' 에 날짜를 더한다. 시각은 다루지 않는다. */
export function kstDatePlus(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
