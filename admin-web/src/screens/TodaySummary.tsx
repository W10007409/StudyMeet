import { useEffect, useState } from 'react'
import type { OperatorApi } from '../api/client'
import type { AsyncState, TodayCounts } from '../domain/types'
import { kstToday } from '../domain/date'
import { errorStyle, mutedStyle, sectionStyle } from './styles'

/** operator.ts 의 TODAY_STATUSES — LOBBY_OPEN 은 DB 에 저장되지 않는 표시용 상태라 뺀다. */
const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: '예정',
  IN_PROGRESS: '진행',
  ENDED: '종료',
  NO_SHOW: '노쇼',
  CANCELLED: '휴강',
}
const STATUS_ORDER = ['SCHEDULED', 'IN_PROGRESS', 'ENDED', 'NO_SHOW', 'CANCELLED']

/** 설계 §4.2 — 사후 확인용이라 실시간일 필요가 없다. 날짜를 바꿀 때만 다시 부른다. */
export function TodaySummary({ api }: { api: OperatorApi }) {
  const [date, setDate] = useState(() => kstToday(new Date()))
  const [state, setState] = useState<AsyncState<TodayCounts>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api
      .getToday(date)
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
      <h2>오늘 집계</h2>
      <div style={{ marginBottom: 12 }}>
        <label>
          날짜{' '}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {state.status === 'loading' && <p style={mutedStyle}>불러오는 중…</p>}
      {state.status === 'error' && <p style={errorStyle}>불러오지 못했다: {state.message}</p>}
      {state.status === 'ready' && (
        <table>
          <tbody>
            {STATUS_ORDER.map((status) => (
              <tr key={status}>
                <td>{STATUS_LABELS[status]}</td>
                <td>{state.data.counts[status as keyof typeof state.data.counts] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
