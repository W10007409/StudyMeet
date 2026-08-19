import { useMemo, useState } from 'react'
import { createStubApi } from './api/stub'
import { createHttpApi } from './api/http'
import { SessionList } from './screens/SessionList'
import { Lesson } from './screens/Lesson'
import type { SessionSummary } from './domain/types'

type View =
  | { name: 'list' }
  | { name: 'lesson'; session: SessionSummary }

export function App() {
  // VITE_API_BASE 가 있으면 실제 scheduling 백엔드로, 없으면 스텁으로 — .env.example 참고.
  const api = useMemo(() => {
    const baseUrl = import.meta.env.VITE_API_BASE
    return baseUrl ? createHttpApi(baseUrl) : createStubApi()
  }, [])
  const [view, setView] = useState<View>({ name: 'list' })

  if (view.name === 'list') {
    return (
      <SessionList
        onEnter={(s) => setView({ name: 'lesson', session: s })}
      />
    )
  }
  if (view.name === 'lesson') {
    return (
      <Lesson
        session={view.session}
        onEnded={() => setView({ name: 'list' })}
      />
    )
  }
}
