/** 설계 §3.2 — 선생님 브라우저가 30초마다 신호를 보낸다. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * 본 설계 §4.5 의 "선생님 연결 소실 90초 후 자동 종료".
 * 주기의 3배로 두는 것은 의도다 — 신호 두 번을 놓쳐도 수업을 끊지 않는다.
 * 진행 중인 수업을 잘못 끊는 쪽이 방치된 방을 조금 늦게 치우는 것보다 나쁘다.
 */
export const STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3

/**
 * 신호가 한 번도 없으면 방치로 보지 않는다.
 * 시작 직후 첫 신호 전일 수 있고, 그때 끊으면 막 시작한 수업을 죽인다.
 */
export function isStale(lastHeartbeatAt: Date | null, now: Date): boolean {
  if (lastHeartbeatAt === null) return false
  return now.getTime() - lastHeartbeatAt.getTime() >= STALE_AFTER_MS
}
