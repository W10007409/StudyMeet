import { describe, expect, it } from 'vitest'
import { formatElapsed, maskPhone } from './format'

describe('formatElapsed', () => {
  it('분:초로 만든다', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(600_000)).toBe('10:00')
  })

  it('한 시간을 넘어도 분으로 센다 — 하드 타임아웃이 30분이라 시간 단위가 필요 없다', () => {
    expect(formatElapsed(3_900_000)).toBe('65:00')
  })

  it('음수는 00:00 으로 막는다', () => {
    expect(formatElapsed(-1)).toBe('00:00')
  })
})

describe('maskPhone', () => {
  it('가운데를 가린다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678')
  })

  it('하이픈이 없어도 처리한다', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678')
  })

  it('알 수 없는 형식은 통째로 가린다 — 실수로 노출하느니 못 쓰는 편이 낫다', () => {
    expect(maskPhone('unknown')).toBe('***')
  })

  it('10자리 구형 번호도 처리한다', () => {
    expect(maskPhone('016-123-4567')).toBe('016-****-4567')
  })

  it('국제 표기는 통째로 가린다 — 자릿수 상한을 넓히면 부분 노출이 시작된다', () => {
    expect(maskPhone('+82 10-1234-5678')).toBe('***')
  })
})
