import { useEffect, useState } from 'react'
import type { OperatorApi } from '../api/client'
import type { AsyncState, LiveSummary as LiveSummaryData } from '../domain/types'
import { errorStyle, mutedStyle, sectionStyle } from './styles'

/** 설계 §4.1 — 10초 폴링. */
const POLL_INTERVAL_MS = 10_000

/**
 * 결정 #4 — 이름은 실제로 세는 것을 말한다. heartbeatLate 는 선생님 브라우저의 생존신호
 * 지연이지 아이의 연결이 아니고, readinessUnknown 은 확인이 실패한 게 아니라 아무 확인도
 * 돌지 않았다는 뜻이다. 두 라벨 모두 설계 §4.1의 표를 그대로 옮겼다.
 */
const FIELDS: { key: keyof LiveSummaryData; label: string }[] = [
  { key: 'inProgress', label: '지금 진행중' },
  { key: 'heartbeatLate', label: '신호 지연 (선생님 브라우저)' },
  { key: 'readinessUnknown', label: '준비 미확인' },
  { key: 'stale', label: '신호 끊김' },
]

export function LiveSummary({ api }: { api: OperatorApi }) {
  const [state, setState] = useState<AsyncState<LiveSummaryData>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const load = () => {
      // 결정 #2 — 아무도 안 보는 탭이 10초마다 서버를 두드릴 이유가 없다.
      if (document.visibilityState !== 'visible') return
      api
        .getLive()
        .then((data) => {
          if (!cancelled) setState({ status: 'ready', data })
        })
        .catch((err: unknown) => {
          if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        })
    }

    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    // 탭이 다시 보이면 남은 폴링 주기를 기다리지 않고 바로 갱신한다.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [api])

  return (
    <section style={sectionStyle}>
      <h2>실시간 요약</h2>
      {state.status === 'loading' && <p style={mutedStyle}>불러오는 중…</p>}
      {state.status === 'error' && <p style={errorStyle}>불러오지 못했다: {state.message}</p>}
      {state.status === 'ready' && (
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {FIELDS.map(({ key, label }) => (
            <div key={key}>
              <div style={{ ...mutedStyle, fontSize: 13 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 600 }}>{state.data[key]}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
