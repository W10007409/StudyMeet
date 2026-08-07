import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { SessionSummary } from '../domain/types'

/** 설계 §4.3 — 종료해도 예정 시각 +30분 안이면 다시 들어갈 수 있다. */
function canEnter(s: SessionSummary): boolean {
  if (s.status === 'LOBBY_OPEN' || s.status === 'IN_PROGRESS') return true
  if (s.status !== 'ENDED') return false
  const limit = new Date(s.scheduledAt).getTime() + 30 * 60 * 1000
  return Date.now() < limit
}

export function SessionList({ api, onEnter }: {
  api: TeacherApi
  onEnter: (s: SessionSummary) => void
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    void api.listSessions(new Date().toISOString().slice(0, 10)).then(setSessions)
  }, [api])

  return (
    <div style={{ padding: 24 }}>
      <h1>오늘 수업</h1>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
