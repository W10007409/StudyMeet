import { describe, expect, it } from 'vitest'
import { HEARTBEAT_INTERVAL_MS, isStale, STALE_AFTER_MS } from './liveness'

const now = new Date('2026-08-08T19:05:00+09:00')

describe('isStale', () => {
  it('방금 신호가 왔으면 살아 있다', () => {
    expect(isStale(new Date('2026-08-08T19:04:50+09:00'), now)).toBe(false)
  })

  it('89초는 아직 살아 있다 — 한 번쯤 놓칠 수 있다', () => {
    expect(isStale(new Date('2026-08-08T19:03:31+09:00'), now)).toBe(false)
  })

  it('90초를 넘기면 방치로 본다', () => {
    expect(isStale(new Date('2026-08-08T19:03:30+09:00'), now)).toBe(true)
  })

  it('신호가 한 번도 없었으면 판정하지 않는다 — 시작 직후일 수 있다', () => {
    expect(isStale(null, now)).toBe(false)
  })
})

describe('상수', () => {
  it('끊김 판정은 주기의 3배다 — 두 번까지는 놓쳐도 살려 둔다', () => {
    expect(STALE_AFTER_MS).toBe(HEARTBEAT_INTERVAL_MS * 3)
  })

  it('본 설계 §4.5 의 90초와 맞는다', () => {
    expect(STALE_AFTER_MS).toBe(90_000)
  })
})
