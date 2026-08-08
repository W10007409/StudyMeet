import { describe, expect, it } from 'vitest'
import { pickStale } from './reapStale'

const now = new Date('2026-08-08T19:05:00+09:00')
const s = (id: string, lastHeartbeatAt: Date | null) => ({ id, lastHeartbeatAt })

describe('pickStale', () => {
  it('90초를 넘긴 것만 고른다', () => {
    const picked = pickStale([
      s('a', new Date('2026-08-08T19:04:50+09:00')),
      s('b', new Date('2026-08-08T19:03:00+09:00')),
    ], now)
    expect(picked).toEqual(['b'])
  })

  it('신호가 없는 세션은 건드리지 않는다 — 막 시작했을 수 있다', () => {
    expect(pickStale([s('a', null)], now)).toEqual([])
  })

  it('고를 것이 없으면 빈 배열이다', () => {
    expect(pickStale([], now)).toEqual([])
  })
})
