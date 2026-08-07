import { describe, expect, it } from 'vitest'
import { canCancel, isNoShow } from './deadline'

const startsAt = new Date('2026-08-07T19:00:00+09:00')

describe('canCancel', () => {
  it('하루 넘게 남았으면 휴강할 수 있다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T10:00:00+09:00'))).toBe(true)
  })

  it('정확히 24시간 전은 아직 된다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T19:00:00+09:00'))).toBe(true)
  })

  it('24시간을 넘기면 안 된다 — 이후 취소는 노쇼로 기록된다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T19:00:01+09:00'))).toBe(false)
    expect(canCancel(startsAt, new Date('2026-08-07T18:00:00+09:00'))).toBe(false)
  })
})

describe('isNoShow', () => {
  it('시작 후 10분이 지나면 노쇼다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T19:10:00+09:00'))).toBe(true)
  })

  it('9분 59초까지는 아직 기다리는 중이다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T19:09:59+09:00'))).toBe(false)
  })

  it('시작 전에는 노쇼가 아니다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T18:59:00+09:00'))).toBe(false)
  })
})
