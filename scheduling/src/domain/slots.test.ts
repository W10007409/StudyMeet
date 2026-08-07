import { describe, expect, it } from 'vitest'
import { isValidSlot, slotsOfDay } from './slots'

describe('slotsOfDay', () => {
  it('15:00 부터 20:00 직전까지 10분 간격으로 만든다', () => {
    const slots = slotsOfDay()
    expect(slots[0]).toBe('15:00')
    expect(slots.at(-1)).toBe('19:50')
    // 5시간 × 6 = 30. 설계 §1.2 의 "선생님당 하루 최대 30슬롯"
    expect(slots).toHaveLength(30)
  })

  it('20:00 은 포함하지 않는다 — 시작하면 20:10 에 끝난다', () => {
    expect(slotsOfDay()).not.toContain('20:00')
  })
})

describe('isValidSlot', () => {
  it('그리드 위의 시각만 받는다', () => {
    expect(isValidSlot('15:00')).toBe(true)
    expect(isValidSlot('19:50')).toBe(true)
    expect(isValidSlot('15:05')).toBe(false)
    expect(isValidSlot('14:50')).toBe(false)
    expect(isValidSlot('20:00')).toBe(false)
  })
})
