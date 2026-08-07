import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { SessionSummary } from '../domain/types'

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
                {/* 시작 5분 전부터만 입장할 수 있다. 설계 §4.1 */}
                <button disabled={s.status !== 'LOBBY_OPEN'} onClick={() => onEnter(s)}>
                  입장
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
