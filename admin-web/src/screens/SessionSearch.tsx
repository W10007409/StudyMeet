import { useState } from 'react'
import type { OperatorApi } from '../api/client'
import type { AsyncState, SessionSearchResult } from '../domain/types'
import { errorStyle, mutedStyle, sectionStyle } from './styles'

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: '예정',
  LOBBY_OPEN: '대기실',
  IN_PROGRESS: '진행',
  ENDED: '종료',
  NO_SHOW: '노쇼',
  CANCELLED: '휴강',
}

/** 설계 §4.5 — 문의 대응용. 마운트 시 자동으로 부르지 않는다(전체 세션을 긁는 조회다). */
export function SessionSearch({ api }: { api: OperatorApi }) {
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  const [state, setState] = useState<AsyncState<SessionSearchResult[]> | { status: 'idle' }>({ status: 'idle' })

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setState({ status: 'loading' })
    api
      .searchSessions({ q: q.trim() || undefined, date: date || undefined })
      .then((data) => setState({ status: 'ready', data }))
      .catch((err: unknown) => setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }))
  }

  return (
    <section style={sectionStyle}>
      <h2>세션 검색</h2>
      <form onSubmit={search} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="학생명 또는 선생님명"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit">검색</button>
      </form>
      {state.status === 'idle' && <p style={mutedStyle}>학생명·선생님명 또는 날짜로 검색한다.</p>}
      {state.status === 'loading' && <p style={mutedStyle}>불러오는 중…</p>}
      {state.status === 'error' && <p style={errorStyle}>불러오지 못했다: {state.message}</p>}
      {state.status === 'ready' && (
        state.data.length === 0 ? (
          <p style={mutedStyle}>일치하는 세션이 없다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>일시</th>
                <th style={{ textAlign: 'left' }}>학생</th>
                <th style={{ textAlign: 'left' }}>담임</th>
                <th style={{ textAlign: 'left' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((s) => (
                <tr key={s.sessionId}>
                  <td>{s.scheduledAt.slice(0, 16).replace('T', ' ')}</td>
                  <td>{s.studentName}</td>
                  <td>{s.teacherName}</td>
                  <td>{STATUS_LABELS[s.status] ?? s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  )
}
