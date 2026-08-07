import { useMemo, useState } from 'react'
import { createStubApi } from './api/stub'
import { SessionList } from './screens/SessionList'
import { Lobby } from './screens/Lobby'
import { Lesson } from './screens/Lesson'
import type { SessionSummary } from './domain/types'

type View =
  | { name: 'list' }
  | { name: 'lobby'; session: SessionSummary }
  | { name: 'lesson'; session: SessionSummary }

export function App() {
  const api = useMemo(() => createStubApi(), [])
  const [view, setView] = useState<View>({ name: 'list' })

  if (view.name === 'list') {
    return <SessionList api={api} onEnter={(s) => setView({ name: 'lobby', session: s })} />
  }
  if (view.name === 'lobby') {
    return (
      <Lobby
        api={api}
        session={view.session}
        onStart={() => setView({ name: 'lesson', session: view.session })}
        onBack={() => setView({ name: 'list' })}
      />
    )
  }
  return (
    <Lesson
      api={api}
      session={view.session}
      onEnded={() => setView({ name: 'list' })}
    />
  )
}
