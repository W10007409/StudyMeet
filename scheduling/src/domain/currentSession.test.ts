import { describe, expect, it } from 'vitest'
import { CURRENT_SESSION_WINDOW_MS, pickCurrentSession } from './currentSession'

const now = new Date('2026-08-12T11:00:00+09:00')

function at(iso: string, status: string, id = 's1') {
  return { id, scheduledAt: new Date(iso), status }
}

describe('pickCurrentSession', () => {
  it('시작 5분 전이면 들어갈 수 있다', () => {
    const s = at('2026-08-12T11:05:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('시작 6분 전이면 아직 아니다 — 대기실이 열리지 않았다', () => {
    const s = at('2026-08-12T11:06:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)).toBeNull()
  })

  it('이미 시작한 수업에는 들어갈 수 있다', () => {
    const s = at('2026-08-12T10:50:00+09:00', 'IN_PROGRESS')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('지난 시각의 SCHEDULED 도 들어갈 수 있다 — 아이가 늦은 경우다', () => {
    const s = at('2026-08-12T10:55:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('끝난 수업에는 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'ENDED')], now)).toBeNull()
  })

  it('취소된 수업에는 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'CANCELLED')], now)).toBeNull()
  })

  it('노쇼 처리된 수업에도 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'NO_SHOW')], now)).toBeNull()
  })

  it('여러 개면 가장 이른 것을 고른다', () => {
    const later = at('2026-08-12T11:04:00+09:00', 'SCHEDULED', 'late')
    const earlier = at('2026-08-12T10:58:00+09:00', 'SCHEDULED', 'early')
    expect(pickCurrentSession([later, earlier], now)?.id).toBe('early')
  })

  it('후보가 없으면 null 이다', () => {
    expect(pickCurrentSession([], now)).toBeNull()
  })

  it('대기실 창은 5분이다', () => {
    expect(CURRENT_SESSION_WINDOW_MS).toBe(5 * 60 * 1000)
  })
})
