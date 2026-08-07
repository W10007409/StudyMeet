import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript and Vitest together', () => {
    const answer: number = 1 + 1
    expect(answer).toBe(2)
  })
})
