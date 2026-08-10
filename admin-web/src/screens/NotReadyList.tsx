import { useEffect, useState } from 'react'
import type { OperatorApi } from '../api/client'
import type { AsyncState, NotReadyItem } from '../domain/types'
import { kstToday } from '../domain/date'
import { errorStyle, mutedStyle, sectionStyle } from './styles'

/**
 * 설계 §4.3 — 선생님이 유선 안내할 대상 목록. readiness 항목은 프리체크 파이프라인이
 * 아직 없어(§9 오픈이슈) 서버가 정직하게 "확인 안 됨"(false/null)을 돌려준다 —
 * 여기서도 그것을 실패로 바꿔 부르지 않고 그대로 보여준다.
 */
export function NotReadyList({ api }: { api: OperatorApi }) {
  const [date, setDate] = useState(() => kstToday(new Date()))
  const [state, setState] = useState<AsyncState<NotReadyItem[]>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api
      .getNotReady(date)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [api, date])

  return (
    <section style={sectionStyle}>
      <h2>준비 실패 목록</h2>
      <div style={{ marginBottom: 12 }}>
        <label>
          날짜{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {state.status === 'loading' && <p style={mutedStyle}>불러오는 중…</p>}
      {state.status === 'error' && <p style={errorStyle}>불러오지 못했다: {state.message}</p>}
      {state.status === 'ready' && (
        state.data.length === 0 ? (
          <p style={mutedStyle}>이 날짜에는 준비 실패 항목이 없다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>시각</th>
                <th style={{ textAlign: 'left' }}>학생</th>
                <th style={{ textAlign: 'left' }}>담임</th>
                <th style={{ textAlign: 'left' }}>카메라</th>
                <th style={{ textAlign: 'left' }}>마이크</th>
                <th style={{ textAlign: 'left' }}>네트워크</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((item) => (
                <tr key={item.sessionId}>
                  <td>{item.scheduledAt.slice(11, 16)}</td>
                  <td>{item.studentName}</td>
                  <td>{item.teacherName}</td>
                  <td>{item.readiness.cameraGranted ? 'O' : '확인 안 됨'}</td>
                  <td>{item.readiness.micGranted ? 'O' : '확인 안 됨'}</td>
                  <td>{item.readiness.networkOk ? 'O' : '확인 안 됨'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </section>
  )
}
