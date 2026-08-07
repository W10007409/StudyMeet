import { describe, expect, it } from 'vitest'
import { expandRule } from './recurrence'

const rule = { weekdays: [2, 4], time: '19:00' } // 화, 목

describe('expandRule', () => {
  it('지정한 요일에만 날짜를 만든다', () => {
    // 2026-08-03 은 월요일
    const dates = expandRule(rule, '2026-08-03', '2026-08-09', [])
    expect(dates).toEqual(['2026-08-04', '2026-08-06'])
  })

  it('공휴일은 건너뛴다 — 없어진 수업이 아니라 처음부터 없던 수업이다', () => {
    const dates = expandRule(rule, '2026-08-03', '2026-08-09', ['2026-08-06'])
    expect(dates).toEqual(['2026-08-04'])
  })

  it('여러 주에 걸쳐 만든다', () => {
    const dates = expandRule(rule, '2026-08-03', '2026-08-16', [])
    expect(dates).toHaveLength(4)
  })

  it('시작일이 해당 요일이면 그날도 포함한다', () => {
    const dates = expandRule(rule, '2026-08-04', '2026-08-04', [])
    expect(dates).toEqual(['2026-08-04'])
  })
})
