/**
 * 저장은 UTC, 판단·표시는 KST(UTC+9) — 상위 설계의 경계 규칙.
 * makeup.ts 의 원래 변환 관례(로컬 toKst)를 여기로 옮겨 teacher.ts 와 함께 쓴다.
 */
const KST_OFFSET_MS = 9 * 3600_000

function kstShifted(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS)
}

/** UTC Date 를 KST 'YYYY-MM-DD' / 'HH:MM' 로 나눈다. */
export function toKstParts(d: Date): { date: string; time: string } {
  const kstIso = kstShifted(d).toISOString()
  return { date: kstIso.slice(0, 10), time: kstIso.slice(11, 16) }
}

/**
 * UTC Date 를 '+09:00' 오프셋이 붙은 ISO 문자열로 바꾼다.
 * 프런트가 문자열을 파싱하지 않고 slice(11, 16) 으로 시각을 읽으므로(SessionList.tsx),
 * toISOString() 의 'Z'(UTC) 그대로 돌려주면 9시간이 어긋나 보인다.
 */
export function toKstIsoString(d: Date): string {
  return `${kstShifted(d).toISOString().slice(0, 19)}+09:00`
}
