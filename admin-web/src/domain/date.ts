/**
 * KST 기준 오늘 날짜. `toISOString()` 은 UTC 라 한국 아침에 전날이 나온다.
 * teacher-web/src/domain/scheduling.ts 의 kstToday 와 같다 — 두 앱이 패키지를 공유하지
 * 않아 그대로 옮겨 적었다.
 */
export function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}
