import type { PageState } from './types'

/**
 * 마지막 조작 우선(LWW). 설계 §7.1.
 * 양방향 동기화라 두 쪽이 동시에 넘길 수 있고, 늦게 도착한 옛 조작이
 * 새 상태를 덮으면 화면이 뒤로 튄다. counter 로만 판단한다.
 */
export function applyPageSync(current: PageState, incoming: PageState): PageState {
  return incoming.counter > current.counter ? incoming : current
}

/** 선생님이 직접 넘길 때. counter 를 하나 올린다. */
export function nextLocalPage(current: PageState, pageNo: number): PageState {
  return { pageNo, counter: current.counter + 1, by: 'teacher' }
}
