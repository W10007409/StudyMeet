import { describe, expect, it } from 'vitest'
import { accumulateDisconnected, isAway } from './presence'

describe('accumulateDisconnected', () => {
  it('연결이 끊긴 동안만 누산한다', () => {
    expect(accumulateDisconnected(1000, 'DISCONNECTED', 500)).toBe(1500)
  })

  it('PIP 는 끊김이 아니다 — 화상이 살아 있다', () => {
    expect(accumulateDisconnected(1000, 'PIP', 500)).toBe(1000)
  })

  it('화면 꺼짐도 끊김이 아니다 — 오디오가 살아 있다', () => {
    expect(accumulateDisconnected(1000, 'SCREEN_OFF', 500)).toBe(1000)
  })

  it('정상 상태에서는 그대로 둔다', () => {
    expect(accumulateDisconnected(1000, 'IN_CLASS', 500)).toBe(1000)
  })
})

describe('isAway', () => {
  it('IN_CLASS 만 자리에 있는 것으로 본다', () => {
    expect(isAway('IN_CLASS')).toBe(false)
    expect(isAway('PIP')).toBe(true)
    expect(isAway('SCREEN_OFF')).toBe(true)
    expect(isAway('DISCONNECTED')).toBe(true)
  })
})
