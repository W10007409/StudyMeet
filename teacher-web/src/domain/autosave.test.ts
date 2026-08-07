import { describe, expect, it, vi } from 'vitest'
import { debounce } from './autosave'

describe('debounce', () => {
  it('마지막 호출만 실행한다', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('a'); d('b'); d('c')
    vi.advanceTimersByTime(2999)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledExactlyOnceWith('c')
    vi.useRealTimers()
  })

  it('flush 하면 즉시 실행한다 — 종료 시 저장을 놓치면 안 된다', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('x')
    d.flush()
    expect(fn).toHaveBeenCalledExactlyOnceWith('x')
    vi.useRealTimers()
  })

  it('자연 발화 뒤의 flush 는 다시 보내지 않는다', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('x')
    vi.advanceTimersByTime(3000)
    expect(fn).toHaveBeenCalledTimes(1)
    d.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('연속 flush 는 한 번만 보낸다', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('y')
    d.flush()
    d.flush()
    expect(fn).toHaveBeenCalledExactlyOnceWith('y')
    vi.useRealTimers()
  })
})
