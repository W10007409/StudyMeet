/**
 * 발송 결과를 선생님이 다음에 할 행동으로 번역한다.
 *
 * 설계 §5.3 — reason 마다 취할 행동이 다르다. "기기 없음"은 보호자 유선 안내이고
 * "서버 미설정"은 운영 문의다. 하나의 문구로 뭉치면 선생님이 헛수고를 한다.
 */
export function nudgeMessage(result: { delivered: boolean; reason?: string }): string {
  if (result.delivered) return '알림을 보냈어요'

  switch (result.reason) {
    case 'NO_DEVICE':
      return '아이 기기에 앱이 등록되어 있지 않아요 — 연락처로 안내해 주세요'
    case 'ALL_TOKENS_INVALID':
      return '아이 기기에 알림이 닿지 않았어요 — 연락처로 안내해 주세요'
    case 'NO_CUSTOMER_NUMBER':
      return '아이 정보가 연결되어 있지 않아요 — 운영팀에 문의해 주세요'
    case 'FCM_NOT_CONFIGURED':
      return '알림 서버가 아직 설정되지 않았어요 — 운영팀에 문의해 주세요'
    case undefined:
      return '알림이 전달되지 않았어요 — 연락처로 시도해 주세요'
    default:
      // 모르는 이유를 삼키면 원인을 추적할 수 없다.
      return `알림이 전달되지 않았어요 — 연락처로 시도해 주세요 (${result.reason})`
  }
}
