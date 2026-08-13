/**
 * 아이를 수업에 부르는 알림의 결과 판정.
 *
 * 화면 설계 §6.1 — 도달 실패를 성공으로 바꾸지 않는다. 선생님이 다음에 할 행동이
 * reason 마다 다르기 때문이다(기기 없음이면 보호자 유선, 서버 거부면 운영 문의).
 */
export type NudgeReason =
  | 'SENT'
  | 'NO_CUSTOMER_NUMBER'
  | 'NO_DEVICE'
  | 'ALL_TOKENS_INVALID'
  | 'FCM_NOT_CONFIGURED'

export interface NudgeOutcome {
  delivered: boolean
  reason: NudgeReason
  sent: number
  failed: number
}

export interface NudgeInput {
  /** FCM 자격증명이 서버에 있는가 */
  configured: boolean
  /** 학생에 매핑된 북클럽 childCustomerNumber */
  customerNumber: string | null
  /** 그 회원번호로 등록된 기기 수 */
  deviceCount: number
  /** FCM 이 접수한 토큰 수 */
  sent: number
  /** FCM 이 거절한 토큰 수 */
  failed: number
}

export function decideNudge(input: NudgeInput): NudgeOutcome {
  const { configured, customerNumber, deviceCount, sent, failed } = input

  if (!configured) {
    return { delivered: false, reason: 'FCM_NOT_CONFIGURED', sent: 0, failed: 0 }
  }
  if (customerNumber === null || customerNumber.trim() === '') {
    return { delivered: false, reason: 'NO_CUSTOMER_NUMBER', sent: 0, failed: 0 }
  }
  if (deviceCount === 0) {
    return { delivered: false, reason: 'NO_DEVICE', sent: 0, failed: 0 }
  }
  // 한 대라도 접수되면 전달로 본다. 나머지 실패는 숨기지 않고 failed 로 함께 돌려준다.
  if (sent > 0) {
    return { delivered: true, reason: 'SENT', sent, failed }
  }
  return { delivered: false, reason: 'ALL_TOKENS_INVALID', sent, failed }
}

/**
 * 아이를 부를 수 있는 세션 상태.
 * 끝난 수업에 아이를 부르는 알림이 가서는 안 된다.
 */
export const NUDGEABLE_STATUSES = ['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS'] as const

export function isNudgeable(status: string): boolean {
  return (NUDGEABLE_STATUSES as readonly string[]).includes(status)
}
