import type { PresenceState } from './types'

/**
 * 누적 끊김 시간. 설계 §5.2.
 * PIP 와 SCREEN_OFF 는 이탈이지만 연결은 살아 있으므로 누산하지 않는다.
 * 선생님이 시간 보상을 판단하는 근거이므로 "화상이 실제로 끊긴 시간"만 센다.
 *
 * deltaMs 는 직전 호출 이후 경과한 시간(델타)이지, 끊김이 시작된 시점부터의
 * 누적 시간이 아니다. 매 틱마다 누적값을 그대로 넘기면 결과가 부풀려진다.
 */
export function accumulateDisconnected(
  prevMs: number,
  state: PresenceState,
  deltaMs: number,
): number {
  return state === 'DISCONNECTED' ? prevMs + deltaMs : prevMs
}

/** 배지를 띄울지 판단한다. IN_CLASS 외에는 전부 무언가 표시한다. */
export function isAway(state: PresenceState): boolean {
  return state !== 'IN_CLASS'
}
