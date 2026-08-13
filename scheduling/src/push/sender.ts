/**
 * 푸시 발송자. 라우트는 이 인터페이스만 알고, 실제 FCM 은 fcm.ts 가 맡는다.
 * 테스트에서 가짜로 갈아끼우기 위한 경계다.
 */
export interface SendResult {
  /** FCM 이 접수한 토큰 */
  okTokens: string[]
  /** FCM 이 "이 토큰은 죽었다" 고 답한 토큰 — 삭제 대상 */
  invalidTokens: string[]
  /** 일시적 실패 — 남겨 두고 다음에 다시 시도한다 */
  failedTokens: string[]
}

export interface PushSender {
  send(tokens: string[], data: Record<string, string>): Promise<SendResult>
}

/**
 * FCM 오류 코드를 "토큰을 지울 것"과 "두고 볼 것"으로 가른다.
 *
 * 모르는 코드는 retryable 로 둔다. 살아 있는 토큰을 지우면 아이가 다시 앱을 열기
 * 전까지 영영 부를 수 없게 되는데, 남겨 두는 쪽의 비용은 다음 발송 한 번의 실패뿐이다.
 */
export function classifyFcmError(code: string): 'invalid' | 'retryable' {
  switch (code) {
    case 'messaging/registration-token-not-registered':
    case 'messaging/invalid-registration-token':
    case 'messaging/invalid-argument':
      return 'invalid'
    default:
      return 'retryable'
  }
}
