import { describe, expect, it } from 'vitest'
import { canRequestCancel, isLateCancel, kstDatePlus, kstToday } from './scheduling'
import type { SessionSummary } from './types'

const session = (status: SessionSummary['status'], scheduledAt: string): SessionSummary => ({
  sessionId: 's1',
  studentName: '김민준',
  studentId: 'stu-1',
  scheduledAt,
  durationMin: 10,
  bookTitle: '마당을 나온 암탉',
  status,
})

const at = '2026-08-10T19:00:00+09:00'

describe('canRequestCancel', () => {
  it('아직 안 한 수업만 휴강할 수 있다', () => {
    expect(canRequestCancel(session('SCHEDULED', at))).toBe(true)
    expect(canRequestCancel(session('LOBBY_OPEN', at))).toBe(true)
  })

  it('이미 끝났거나 취소된 수업은 휴강할 수 없다', () => {
    expect(canRequestCancel(session('ENDED', at))).toBe(false)
    expect(canRequestCancel(session('CANCELLED', at))).toBe(false)
    expect(canRequestCancel(session('NO_SHOW', at))).toBe(false)
    expect(canRequestCancel(session('IN_PROGRESS', at))).toBe(false)
  })
})

describe('isLateCancel', () => {
  it('24시간 넘게 남았으면 늦지 않았다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T10:00:00+09:00'))).toBe(false)
  })

  it('정확히 24시간 전은 아직 늦지 않았다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T19:00:00+09:00'))).toBe(false)
  })

  it('24시간을 넘기면 늦은 것이다 — 막지는 않지만 노쇼로 기록된다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T19:00:01+09:00'))).toBe(true)
  })
})

describe('kstToday', () => {
  it('UTC 로 밀리지 않는다 — 한국의 아침은 전날 UTC 다', () => {
    // 2026-08-10 08:00 KST = 2026-08-09 23:00 UTC
    expect(kstToday(new Date('2026-08-10T08:00:00+09:00'))).toBe('2026-08-10')
  })

  it('한국의 자정 직후도 그날이다', () => {
    expect(kstToday(new Date('2026-08-10T00:10:00+09:00'))).toBe('2026-08-10')
  })
})

describe('kstDatePlus', () => {
  it('날짜를 더한다', () => {
    expect(kstDatePlus('2026-08-10', 6)).toBe('2026-08-16')
  })

  it('달을 넘어간다', () => {
    expect(kstDatePlus('2026-08-30', 3)).toBe('2026-09-02')
  })
})
