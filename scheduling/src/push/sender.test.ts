import { describe, expect, it } from 'vitest'
import { classifyFcmError } from './sender'

describe('classifyFcmError', () => {
  it('등록이 해제된 토큰은 지워야 한다', () => {
    expect(classifyFcmError('messaging/registration-token-not-registered')).toBe('invalid')
  })

  it('형식이 틀린 토큰도 지워야 한다', () => {
    expect(classifyFcmError('messaging/invalid-registration-token')).toBe('invalid')
  })

  it('인자 오류도 지워야 한다', () => {
    expect(classifyFcmError('messaging/invalid-argument')).toBe('invalid')
  })

  it('서버 사용 불가는 일시적이다 — 토큰을 지우지 않는다', () => {
    expect(classifyFcmError('messaging/server-unavailable')).toBe('retryable')
  })

  it('할당량 초과도 일시적이다', () => {
    expect(classifyFcmError('messaging/quota-exceeded')).toBe('retryable')
  })

  it('모르는 코드는 지우지 않는다 — 지우는 쪽이 되돌릴 수 없다', () => {
    expect(classifyFcmError('messaging/something-new')).toBe('retryable')
  })
})
