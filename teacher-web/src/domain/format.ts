/** 경과·이탈·끊김 시간 표시. 설계 §3. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 연락처 마스킹. 설계 §6.2.
 * 아동 개인정보이므로 기본은 가린 상태이고, 형식을 알 수 없으면 아무것도 보여주지 않는다.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return '***'
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-****-${tail}`
}
