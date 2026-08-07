export interface Debounced<A extends unknown[]> {
  (...args: A): void
  flush(): void
}

/**
 * 메모 자동저장용. 설계 §8.
 * flush 가 있는 이유는 종료 버튼을 누른 순간 아직 안 나간 저장이 남아 있을 수 있어서다.
 * 연속 수업에서 마지막 몇 글자가 사라지면 선생님이 다시 적을 방법이 없다.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last: A | null = null

  const wrapped = ((...args: A) => {
    last = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; if (last) fn(...last) }, ms)
  }) as Debounced<A>

  wrapped.flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (last) fn(...last)
  }

  return wrapped
}
