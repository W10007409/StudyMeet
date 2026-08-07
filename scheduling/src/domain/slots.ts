/** 설계 §1.2 — 수업은 15:00~20:00 사이 10분 단위 그리드 위에서만 열린다. */
export const SLOT_START_HOUR = 15
export const SLOT_END_HOUR = 20
export const SLOT_MINUTES = 10

export function slotsOfDay(): string[] {
  const out: string[] = []
  for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
}

const VALID = new Set(slotsOfDay())

export function isValidSlot(hhmm: string): boolean {
  return VALID.has(hhmm)
}
