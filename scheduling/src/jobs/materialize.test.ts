import { describe, expect, it } from 'vitest'
import { sessionsToCreate } from './materialize'

const wanted = ['2026-08-04', '2026-08-06', '2026-08-11']

describe('sessionsToCreate', () => {
  it('아직 없는 날짜만 만든다', () => {
    expect(sessionsToCreate(wanted, ['2026-08-04'])).toEqual(['2026-08-06', '2026-08-11'])
  })

  it('전부 있으면 아무것도 만들지 않는다 — 배치는 매일 돈다', () => {
    expect(sessionsToCreate(wanted, wanted)).toEqual([])
  })

  it('없던 날짜가 생겨도 기존 것을 건드리지 않는다', () => {
    expect(sessionsToCreate(wanted, [])).toEqual(wanted)
  })
})
