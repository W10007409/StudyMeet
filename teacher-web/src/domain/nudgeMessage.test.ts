import { describe, expect, it } from 'vitest'
import { nudgeMessage } from './nudgeMessage'

describe('nudgeMessage', () => {
  it('전달됐으면 그렇게 말한다', () => {
    expect(nudgeMessage({ delivered: true, reason: 'SENT' })).toBe('알림을 보냈어요')
  })

  it('기기가 없으면 보호자 연락을 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'NO_DEVICE' }))
      .toBe('아이 기기에 앱이 등록되어 있지 않아요 — 연락처로 안내해 주세요')
  })

  it('회원번호 미매핑은 운영 문의로 안내한다 — 선생님이 할 수 있는 일이 아니다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'NO_CUSTOMER_NUMBER' }))
      .toBe('아이 정보가 연결되어 있지 않아요 — 운영팀에 문의해 주세요')
  })

  it('토큰이 전부 거절되면 보호자 연락을 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'ALL_TOKENS_INVALID' }))
      .toBe('아이 기기에 알림이 닿지 않았어요 — 연락처로 안내해 주세요')
  })

  it('서버에 알림 설정이 없으면 운영 문의로 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'FCM_NOT_CONFIGURED' }))
      .toBe('알림 서버가 아직 설정되지 않았어요 — 운영팀에 문의해 주세요')
  })

  it('모르는 이유도 삼키지 않는다 — 원문을 함께 보여준다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'WHAT_IS_THIS' }))
      .toBe('알림이 전달되지 않았어요 — 연락처로 시도해 주세요 (WHAT_IS_THIS)')
  })

  it('이유가 아예 없어도 실패는 실패라고 말한다', () => {
    expect(nudgeMessage({ delivered: false }))
      .toBe('알림이 전달되지 않았어요 — 연락처로 시도해 주세요')
  })
})
