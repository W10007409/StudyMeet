import { describe, expect, it } from 'vitest'
import { CREDIT_WARN_THRESHOLD, creditDelta, shouldWarn } from './credit'

describe('creditDelta', () => {
  it('결석·노쇼·휴강은 크레딧을 만든다', () => {
    expect(creditDelta('STUDENT_ABSENT')).toBe(1)
    expect(creditDelta('NO_SHOW')).toBe(1)
    expect(creditDelta('TEACHER_CANCELLED')).toBe(1)
    expect(creditDelta('OPS_CANCELLED')).toBe(1)
  })

  it('공휴일은 크레딧을 만들지 않는다 — 처음부터 없던 수업이다', () => {
    expect(creditDelta('HOLIDAY')).toBe(0)
  })

  it('보강을 잡으면 크레딧을 쓴다', () => {
    expect(creditDelta('MAKEUP_BOOKED')).toBe(-1)
  })

  it('정상 종료는 크레딧과 무관하다', () => {
    expect(creditDelta('COMPLETED')).toBe(0)
  })
})

describe('shouldWarn', () => {
  it('임계치를 넘으면 경고한다 — 소진할 슬롯이 유한하기 때문이다', () => {
    expect(shouldWarn(CREDIT_WARN_THRESHOLD)).toBe(true)
    expect(shouldWarn(CREDIT_WARN_THRESHOLD - 1)).toBe(false)
  })
})
