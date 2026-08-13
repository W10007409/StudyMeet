import { describe, expect, it } from 'vitest'
import { DeviceBody } from './device'

describe('DeviceBody', () => {
  it('안드로이드 등록 요청을 받는다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'android',
      appVersion: '1.0-bookpad',
    })
    expect(parsed.success).toBe(true)
  })

  it('appVersion 은 없어도 된다 — 있으면 좋은 진단 정보일 뿐이다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'android',
    })
    expect(parsed.success).toBe(true)
  })

  it('빈 토큰은 거절한다 — 저장해 두면 발송 때 실패로만 나타난다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: '',
      platform: 'android',
    })
    expect(parsed.success).toBe(false)
  })

  it('빈 회원번호는 거절한다 — 누구의 기기인지 모르는 행이 된다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: '',
      token: 'fcm-token-abc',
      platform: 'android',
    })
    expect(parsed.success).toBe(false)
  })

  it('모르는 플랫폼은 거절한다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'windows',
    })
    expect(parsed.success).toBe(false)
  })
})
