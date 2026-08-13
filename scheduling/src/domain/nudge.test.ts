import { describe, expect, it } from 'vitest'
import { decideNudge, isNudgeable, NUDGEABLE_STATUSES } from './nudge'

describe('decideNudge', () => {
  it('자격증명이 없으면 보내지 않았다고 말한다', () => {
    expect(decideNudge({ configured: false, customerNumber: 'MC1', deviceCount: 2, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'FCM_NOT_CONFIGURED', sent: 0, failed: 0 })
  })

  it('학생에게 회원번호가 매핑되지 않았으면 그 사실을 그대로 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: null, deviceCount: 0, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'NO_CUSTOMER_NUMBER', sent: 0, failed: 0 })
  })

  it('빈 문자열 회원번호도 매핑 안 됨으로 본다', () => {
    expect(decideNudge({ configured: true, customerNumber: '   ', deviceCount: 0, sent: 0, failed: 0 }).reason)
      .toBe('NO_CUSTOMER_NUMBER')
  })

  it('등록된 기기가 없으면 토큰 실패와 구분해서 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 0, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'NO_DEVICE', sent: 0, failed: 0 })
  })

  it('기기는 있는데 전부 거절당하면 토큰 문제로 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 2, sent: 0, failed: 2 }))
      .toEqual({ delivered: false, reason: 'ALL_TOKENS_INVALID', sent: 0, failed: 2 })
  })

  it('한 대라도 접수되면 전달된 것이다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 2, sent: 1, failed: 1 }))
      .toEqual({ delivered: true, reason: 'SENT', sent: 1, failed: 1 })
  })

  it('부분 성공을 숨기지 않는다 — 실패 수를 그대로 남긴다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 3, sent: 1, failed: 2 }).failed)
      .toBe(2)
  })
})

describe('isNudgeable', () => {
  it('예정·대기실·진행 중인 수업은 부를 수 있다', () => {
    expect(isNudgeable('SCHEDULED')).toBe(true)
    expect(isNudgeable('LOBBY_OPEN')).toBe(true)
    expect(isNudgeable('IN_PROGRESS')).toBe(true)
  })

  it('끝났거나 취소된 수업에는 아이를 부르지 않는다', () => {
    expect(isNudgeable('ENDED')).toBe(false)
    expect(isNudgeable('CANCELLED')).toBe(false)
    expect(isNudgeable('NO_SHOW')).toBe(false)
  })

  it('모르는 상태는 부를 수 없다고 본다', () => {
    expect(isNudgeable('WHATEVER')).toBe(false)
  })

  it('목록은 세 개다', () => {
    expect(NUDGEABLE_STATUSES).toEqual(['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS'])
  })
})
