import type { PresenceState } from './types'

/**
 * 누적 끊김 시간. 설계 §5.2.
 * PIP 와 SCREEN_OFF 는 이탈이지만 연결은 살아 있으므로 누산하지 않는다.
 * 선생님이 시간 보상을 판단하는 근거이므로 "화상이 실제로 끊긴 시간"만 센다.
 */
export function accumulateDisconnected(
  prevMs: number,
  state: PresenceState,
  elapsedMs: number,
): number {
  return state === 'DISCONNECTED' ? prevMs + elapsedMs : prevMs
}

/** 배지를 띄울지 판단한다. IN_CLASS 외에는 전부 무언가 표시한다. */
export function isAway(state: PresenceState): boolean {
  return state !== 'IN_CLASS'
}
