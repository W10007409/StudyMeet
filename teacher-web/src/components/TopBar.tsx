import { formatElapsed } from '../domain/format'
import type { PresenceState } from '../domain/types'

const BADGE: Record<Exclude<PresenceState, 'IN_CLASS'>, { icon: string; label: string }> = {
  PIP: { icon: '🟡', label: '다른 화면' },
  SCREEN_OFF: { icon: '🟠', label: '자리비움' },
  DISCONNECTED: { icon: '🔴', label: '연결 끊김' },
}

export function TopBar({ studentName, elapsedMs, presence, presenceMs, disconnectedMs, onEnd }: {
  studentName: string
  elapsedMs: number
  presence: PresenceState
  presenceMs: number
  disconnectedMs: number
  onEnd: () => void
}) {
  const badge = presence === 'IN_CLASS' ? null : BADGE[presence]
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #ddd' }}>
      <strong>{studentName}</strong>
      <span>경과 {formatElapsed(elapsedMs)}</span>
      {badge && <span>{badge.icon} {badge.label} {formatElapsed(presenceMs)}</span>}
      {/* 시간 보상이 선생님 재량이므로 근거를 항상 보여준다. 설계 §5.2 */}
      <span>끊김 {formatElapsed(disconnectedMs)}</span>
      <button style={{ marginLeft: 'auto' }} onClick={onEnd}>수업 종료</button>
    </div>
  )
}
