import { describe, expect, it } from 'vitest'
import { applyPageSync, nextLocalPage } from './pageSync'
import type { PageState } from './types'

const at = (pageNo: number, counter: number, by: PageState['by']): PageState =>
  ({ pageNo, counter, by })

describe('applyPageSync', () => {
  it('더 큰 counter 를 받으면 적용한다', () => {
    expect(applyPageSync(at(1, 1, 'teacher'), at(5, 2, 'student')))
      .toEqual(at(5, 2, 'student'))
  })

  it('더 작은 counter 는 무시한다 — 늦게 도착한 옛 조작', () => {
    expect(applyPageSync(at(5, 9, 'teacher'), at(2, 3, 'student')))
      .toEqual(at(5, 9, 'teacher'))
  })

  it('counter 가 같으면 무시한다 — 이미 적용된 것', () => {
    expect(applyPageSync(at(5, 9, 'teacher'), at(7, 9, 'student')))
      .toEqual(at(5, 9, 'teacher'))
  })
})

describe('nextLocalPage', () => {
  it('내가 넘기면 counter 를 올리고 by 를 teacher 로 둔다', () => {
    expect(nextLocalPage(at(3, 7, 'student'), 4)).toEqual(at(4, 8, 'teacher'))
  })
})
