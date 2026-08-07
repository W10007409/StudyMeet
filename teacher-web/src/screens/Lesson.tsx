import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { DataMessage, PageState, PresenceState, SessionSummary } from '../domain/types'
import { applyPageSync, nextLocalPage } from '../domain/pageSync'
import { accumulateDisconnected } from '../domain/presence'
import { useSession } from '../webrtc/useSession'
import { TopBar } from '../components/TopBar'
import { BookViewer } from '../components/BookViewer'

const TOTAL_PAGES = 48

export function Lesson({ api, session, onEnded }: {
  api: TeacherApi
  session: SessionSummary
  onEnded: () => void
}) {
  const [page, setPage] = useState<PageState>({ pageNo: 1, counter: 0, by: 'teacher' })
  const [lastBy, setLastBy] = useState<'teacher' | 'student' | null>(null)
  const [presence, setPresence] = useState<PresenceState>('IN_CLASS')
  const [presenceSince, setPresenceSince] = useState(Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [presenceMs, setPresenceMs] = useState(0)
  const [disconnectedMs, setDisconnectedMs] = useState(0)
  const [note, setNote] = useState('')

  const startedAt = useRef(Date.now())
  const noteRef = useRef('')
  noteRef.current = note

  const onData = useCallback((msg: DataMessage) => {
    if (msg.type === 'page_sync') {
      setPage((cur) => {
        const next = applyPageSync(cur, { pageNo: msg.pageNo, counter: msg.counter, by: msg.by })
        if (next !== cur) setLastBy(msg.by)
        return next
      })
    } else if (msg.type === 'presence') {
      setPresence(msg.state)
      setPresenceSince(Date.now())
    }
  }, [])

  // 접속 정보는 환경변수가 아니라 백엔드에서 받는다. 방 이름과 역할을 서버가 정해야
  // 나중에 편성 시스템이 붙어도 화면이 안 바뀐다.
  const [conn, setConn] = useState<{ signalingUrl: string; room: string; role: 'caller' | 'callee' } | null>(null)
  useEffect(() => {
    void api.getToken(session.sessionId).then(setConn)
  }, [api, session.sessionId])

  const { localRef, remoteRef, send } = useSession({
    signalingUrl: conn?.signalingUrl ?? '',
    room: conn?.room ?? '',
    role: conn?.role ?? 'caller',
    onData,
    enabled: conn !== null,
  })

  // 1초 틱 하나로 경과·이탈·누적 끊김을 모두 갱신한다.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current)
      setPresenceMs(Date.now() - presenceSince)
      setDisconnectedMs((prev) => accumulateDisconnected(prev, presence, 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [presence, presenceSince])

  // 토스트는 1.5초만 띄운다.
  useEffect(() => {
    if (!lastBy) return
    const id = setTimeout(() => setLastBy(null), 1500)
    return () => clearTimeout(id)
  }, [lastBy])

  const changePage = (pageNo: number) => {
    setPage((cur) => {
      const next = nextLocalPage(cur, pageNo)
      send({ type: 'page_sync', pageNo: next.pageNo, counter: next.counter, by: 'teacher' })
      return next
    })
    setLastBy('teacher')
  }

  const end = async () => {
    await api.endSession(session.sessionId, noteRef.current, Math.round(disconnectedMs / 1000))
    onEnded()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        studentName={session.studentName}
        elapsedMs={elapsedMs}
        presence={presence}
        presenceMs={presenceMs}
        disconnectedMs={disconnectedMs}
        onEnd={end}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <BookViewer
          pageNo={page.pageNo}
          totalPages={TOTAL_PAGES}
          lastBy={lastBy}
          onPage={changePage}
          onPointer={(x, y, action) => send({ type: 'pointer', x, y, action })}
        />
        <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column' }}>
          {/* 아이 영상을 크게. 표정을 읽는 것이 선생님의 일이다. 설계 §3.1 */}
          <video ref={remoteRef} autoPlay playsInline style={{ flex: 2, background: '#000', minHeight: 0 }} />
          <video ref={localRef} autoPlay playsInline muted style={{ flex: 1, background: '#000', minHeight: 0 }} />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모"
            style={{ height: 120, resize: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
