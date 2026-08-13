/**
 * 아이가 "지금" 들어갈 수 있는 수업을 고른다.
 *
 * 선생님 화면의 대기실 창과 같은 5분을 쓴다. 두 화면이 서로 다른 시각에 열리면
 * 선생님은 기다리는데 아이는 들어갈 수 없는 구간이 생긴다.
 */
export const CURRENT_SESSION_WINDOW_MS = 5 * 60 * 1000

export interface SessionCandidate {
  id: string
  scheduledAt: Date
  status: string
}

/**
 * 들어갈 수 있는 상태. 끝났거나 취소된 수업에는 아이를 들여보내지 않는다.
 * 편성 설계의 "ENDED +30분 재입장"은 선생님이 메모를 마저 쓰기 위한 규칙이며
 * 아이에게 적용되지 않는다.
 */
const JOINABLE_STATUSES = ['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS']

export function pickCurrentSession(
  candidates: SessionCandidate[],
  now: Date,
): SessionCandidate | null {
  const opensBy = now.getTime() + CURRENT_SESSION_WINDOW_MS

  const joinable = candidates
    .filter((c) => JOINABLE_STATUSES.includes(c.status))
    // 시작 5분 전부터 들어갈 수 있다. 지난 시각은 늦게 들어오는 경우이므로 막지 않는다.
    .filter((c) => c.scheduledAt.getTime() <= opensBy)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

  return joinable[0] ?? null
}
