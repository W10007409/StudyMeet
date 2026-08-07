/** 설계 §4.2 — 휴강은 하루 전까지. 여기서 "하루"는 24시간으로 해석한다. */
export const CANCEL_LEAD_MS = 24 * 60 * 60 * 1000

/** 설계 §4.1 — 자동 노쇼 판정. 수업 길이와 같은 10분이다. */
export const NO_SHOW_AFTER_MS = 10 * 60 * 1000

export function canCancel(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= CANCEL_LEAD_MS
}

/**
 * 자동 판정만 담당한다.
 * 선생님은 이 시각 이전에도 [노쇼 처리] 로 직접 끝낼 수 있다 — 설계 §4.1.
 * 이 함수는 선생님이 아무 조치도 하지 않았을 때의 안전망이다.
 */
export function isNoShow(startsAt: Date, now: Date): boolean {
  return now.getTime() - startsAt.getTime() >= NO_SHOW_AFTER_MS
}
