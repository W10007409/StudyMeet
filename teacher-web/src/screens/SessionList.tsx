import { useCallback, useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { SessionSummary } from '../domain/types'
import { canRequestCancel, isLateCancel } from '../domain/scheduling'

/** 설계 §4.3 — 종료해도 예정 시각 +30분 안이면 다시 들어갈 수 있다. */
function canEnter(s: SessionSummary): boolean {
  if (s.status === 'LOBBY_OPEN' || s.status === 'IN_PROGRESS') return true
  if (s.status !== 'ENDED') return false
  const limit = new Date(s.scheduledAt).getTime() + 30 * 60 * 1000
  return Date.now() < limit
}

export function SessionList({ api, onEnter, onStudents }: {
  api: TeacherApi
  onEnter: (s: SessionSummary) => void
  onStudents: () => void
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [cancelResult, setCancelResult] = useState<string | null>(null)

  const load = useCallback(() => {
    void api.listSessions(new Date().toISOString().slice(0, 10)).then(setSessions)
  }, [api])

  useEffect(() => { load() }, [load])

  const cancel = async (s: SessionSummary) => {
    // 확인은 여기서 둔다 — 수업 종료와 달리 휴강은 되돌릴 수 없고 연속 동작도 아니다.
    const late = isLateCancel(s.scheduledAt, new Date())
    const confirmMessage = late
      ? '하루 전 마감이 지났어요. 휴강해도 되지만 노쇼로 기록됩니다. 학생의 보강 크레딧은 똑같이 지급돼요.\n\n휴강하시겠어요?'
      : '휴강하시겠어요?'
    // 막지 않는다 — 편성 설계 §4.2, 늦은 연락으로 가족을 벌하지 않는다. 확인만 받고 그대로 진행한다.
    if (!window.confirm(confirmMessage)) return

    const result = await api.cancelSession(s.sessionId)
    setCancelResult(`${s.studentName}: ${result.status}`)
    load()
  }

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onStudents}>담당 학생</button>
      <h1>오늘 수업</h1>
      {cancelResult && <p>{cancelResult}</p>}
      <table>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId}>
              <td>{s.scheduledAt.slice(11, 16)}</td>
              <td>{s.studentName}</td>
              <td>{s.bookTitle}</td>
              <td>
                {/* 시작 5분 전부터만 입장할 수 있다. 설계 §4.1. 종료해도 예정 시각 +30분 안이면 재입장 가능. 설계 §4.3 */}
                <button disabled={!canEnter(s)} onClick={() => onEnter(s)}>
                  {s.status === 'ENDED' ? '다시 입장' : '입장'}
                </button>
              </td>
              <td>
                {canRequestCancel(s) && (
                  <button onClick={() => void cancel(s)}>휴강</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
