import { useMemo, useState } from 'react'
import { createStubApi } from './api/stub'
import { createHttpApi } from './api/http'
import { SessionList } from './screens/SessionList'
import { Lobby } from './screens/Lobby'
import { Lesson } from './screens/Lesson'
import { MyStudents } from './screens/MyStudents'
import { MakeupBooking } from './screens/MakeupBooking'
import type { SessionSummary } from './domain/types'
import type { StudentCredit } from './api/client'

type View =
  | { name: 'list' }
  | { name: 'lobby'; session: SessionSummary }
  | { name: 'lesson'; session: SessionSummary }
  | { name: 'students' }
  | { name: 'makeup'; student: StudentCredit }

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
        api={api}
        onEnter={(s) => setView({ name: 'lobby', session: s })}
        onStudents={() => setView({ name: 'students' })}
      />
    )
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
  if (view.name === 'lesson') {
    return (
      <Lesson
        api={api}
        session={view.session}
        onEnded={() => setView({ name: 'list' })}
      />
    )
  }
  if (view.name === 'students') {
    return (
      <MyStudents
        api={api}
        onBack={() => setView({ name: 'list' })}
        onBook={(student) => setView({ name: 'makeup', student })}
      />
    )
  }
  return (
    <MakeupBooking
      api={api}
      student={view.student}
      onBack={() => setView({ name: 'students' })}
    />
  )
}
