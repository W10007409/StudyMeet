export type CreditEvent =
  | 'STUDENT_ABSENT'
  | 'NO_SHOW'
  | 'TEACHER_CANCELLED'
  | 'OPS_CANCELLED'
  | 'HOLIDAY'
  | 'MAKEUP_BOOKED'
  | 'COMPLETED'

/**
 * 설계 §5.2 — 크레딧은 소멸하지 않지만, 담임의 빈 슬롯은 하루 30개로 유한하다.
 * 쌓이기만 하고 쓸 자리가 없어지는 상황을 사람이 알아채도록 경고만 세운다.
 * 이 값은 설계 §9 오픈이슈 #3 이며 운영 확정 후 조정한다.
 */
export const CREDIT_WARN_THRESHOLD = 5

export function creditDelta(event: CreditEvent): number {
  switch (event) {
    case 'STUDENT_ABSENT':
    case 'NO_SHOW':
    case 'TEACHER_CANCELLED':
    case 'OPS_CANCELLED':
      return 1
    case 'MAKEUP_BOOKED':
      return -1
    // 공휴일은 세션 자체를 만들지 않으므로 잃은 수업이 없다. 설계 §4.3
    case 'HOLIDAY':
    case 'COMPLETED':
      return 0
  }
}

export function shouldWarn(balance: number): boolean {
  return balance >= CREDIT_WARN_THRESHOLD
}
