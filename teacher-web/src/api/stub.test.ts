import { describe, expect, it } from 'vitest'
import { createStubApi } from './stub'

describe('createStubApi', () => {
  it('오늘 수업 목록을 시간순으로 준다', async () => {
    const api = createStubApi()
    const list = await api.listSessions('2026-08-07')
    expect(list.length).toBeGreaterThan(0)
    const times = list.map((s) => s.scheduledAt)
    expect([...times].sort()).toEqual(times)
  })

  it('nudge 결과에 도달 여부가 담긴다 — 조용히 성공한 척하지 않는다', async () => {
    const api = createStubApi()
    const result = await api.nudge('s1')
    expect(result).toHaveProperty('delivered')
  })

  it('종료하면 메모와 끊김 시간을 받아 둔다', async () => {
    const api = createStubApi()
    await api.endSession('s1', '집중 잘함', 24)
    expect(api.lastEnd).toEqual({ sessionId: 's1', note: '집중 잘함', disconnectedSec: 24 })
  })
})
