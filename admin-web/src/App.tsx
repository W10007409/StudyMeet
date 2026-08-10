import { useMemo } from 'react'
import { createHttpApi } from './api/http'
import { LiveSummary } from './screens/LiveSummary'
import { TodaySummary } from './screens/TodaySummary'
import { NotReadyList } from './screens/NotReadyList'
import { CreditWarnings } from './screens/CreditWarnings'
import { SessionSearch } from './screens/SessionSearch'
import { errorStyle } from './screens/styles'

/**
 * 결정 #5 — 한 페이지, 라우터 없음. 설계 §4의 다섯 가지를 세로로 쌓는다.
 * 이것은 모니터링 화면이지 앱이 아니다.
 */
export function App() {
  const baseUrl = import.meta.env.VITE_API_BASE
  const secret = import.meta.env.VITE_OPERATOR_SECRET

  const api = useMemo(() => {
    if (!baseUrl || !secret) return null
    return createHttpApi(baseUrl, secret)
  }, [baseUrl, secret])

  if (!api) {
    return (
      <div style={{ padding: 24 }}>
        <h1>StudyMeet 운영자</h1>
        <p style={errorStyle}>
          VITE_API_BASE 또는 VITE_OPERATOR_SECRET 이 설정되지 않았다. admin-web/.env.local 을
          admin-web/.env.example 을 참고해 채운다.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      <h1>StudyMeet 운영자</h1>
      <LiveSummary api={api} />
      <TodaySummary api={api} />
      <NotReadyList api={api} />
      <CreditWarnings api={api} />
      <SessionSearch api={api} />
    </div>
  )
}
