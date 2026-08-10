import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { DataMessage, PageState, PresenceState, SessionSummary } from '../domain/types'
import { applyPageSync, nextLocalPage } from '../domain/pageSync'
import { accumulateDisconnected } from '../domain/presence'
import { debounce, type Debounced } from '../domain/autosave'
import { useSession } from '../webrtc/useSession'
import { TopBar } from '../components/TopBar'
import { BookViewer } from '../components/BookViewer'

const TOTAL_PAGES = 48
/** scheduling/src/domain/liveness.ts 의 HEARTBEAT_INTERVAL_MS 와 같은 값. 백엔드 패키지가
 * 달라 임포트할 수 없으므로 프론트에 상수로 둔다 — 값을 바꾸려면 양쪽을 같이 고친다. */
const HEARTBEAT_INTERVAL_MS = 30_000

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
  const saveNoteRef = useRef<Debounced<[string]> | null>(null)
  if (saveNoteRef.current === null) {
    saveNoteRef.current = debounce((text: string) => { void api.saveNote(session.sessionId, text) }, 3000)
  }
  const saveNote = saveNoteRef.current
  const pageRef = useRef<PageState>({ pageNo: 1, counter: 0, by: 'teacher' })
  pageRef.current = page
  const presenceRef = useRef<PresenceState>('IN_CLASS')
  presenceRef.current = presence
  const presenceSinceRef = useRef(Date.now())
  presenceSinceRef.current = presenceSince

  const onData = useCallback((msg: DataMessage) => {
    if (msg.type === 'page_sync') {
      const incoming = { pageNo: msg.pageNo, counter: msg.counter, by: msg.by }
      const next = applyPageSync(pageRef.current, incoming)
      if (next !== pageRef.current) {
        pageRef.current = next
        setPage(next)
        setLastBy(msg.by)
      }
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

  // startSession 은 접속 정보가 도착한 뒤 딱 한 번만 부른다 — 마운트 시점에 부르면
  // 실제로 시작하지 않은 수업까지 진행 중으로 기록된다. 실패(이미 시작됨, 네트워크
  // 순단)해도 화면은 계속 진행한다: 운영자 집계가 틀리는 것이 아이가 수업을 못 받는
  // 것보다 훨씬 작은 손해다. 생존신호는 별도 타이머다 — 1초 틱과 주기도 목적도 다르고,
  // 실패해도 화면에 띄우지 않는다(선생님이 할 수 있는 일이 없다). 인터벌 ID는 그려지는
  // 값이 아니므로 state 가 아니라 ref 에 둔다 — 이 화면의 표준 규칙.
  const startedRef = useRef(false)
  const heartbeatIdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (conn === null || startedRef.current) return
    startedRef.current = true

    void api.startSession(session.sessionId).catch((err: unknown) => {
      console.warn('startSession 실패 — 수업은 계속 진행한다', err)
    })

    heartbeatIdRef.current = setInterval(() => {
      void api.heartbeat(session.sessionId).catch((err: unknown) => {
        console.warn('heartbeat 실패 — 화면에는 띄우지 않는다', err)
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      if (heartbeatIdRef.current !== null) {
        clearInterval(heartbeatIdRef.current)
        heartbeatIdRef.current = null
      }
    }
  }, [api, session.sessionId, conn])

  const { localRef, remoteRef, send } = useSession({
    signalingUrl: conn?.signalingUrl ?? '',
    room: conn?.room ?? '',
    role: conn?.role ?? 'caller',
    onData,
    enabled: conn !== null,
  })

  // 1초 틱 하나로 경과·이탈·누적 끊김을 모두 갱신한다.
  // presence/presenceSince를 deps에 넣으면 접속이 바뀔 때마다 인터벌이
  // 재생성되면서 대기 중이던 tick이 유실된다. 컴포넌트 생애 동안 하나만
  // 돌리고, 최신 값은 ref로 읽는다.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current)
      setPresenceMs(Date.now() - presenceSinceRef.current)
      setDisconnectedMs((prev) => accumulateDisconnected(prev, presenceRef.current, 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // 토스트는 1.5초만 띄운다.
  useEffect(() => {
    if (!lastBy) return
    const id = setTimeout(() => setLastBy(null), 1500)
    return () => clearTimeout(id)
  }, [lastBy])

  const changePage = (pageNo: number) => {
    const next = nextLocalPage(pageRef.current, pageNo)
    pageRef.current = next
    setPage(next)
    setLastBy('teacher')
    send({ type: 'page_sync', pageNo: next.pageNo, counter: next.counter, by: 'teacher' })
  }

  const changePageBy = (delta: number) => {
    const target = Math.min(TOTAL_PAGES, Math.max(1, pageRef.current.pageNo + delta))
    if (target === pageRef.current.pageNo) return
    changePage(target)
  }

  const end = async () => {
    saveNote.flush()
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
          onPageDelta={changePageBy}
          onPointer={(x, y, action) => send({ type: 'pointer', x, y, action })}
        />
        <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column' }}>
          {/* 아이 영상을 크게. 표정을 읽는 것이 선생님의 일이다. 설계 §3.1 */}
          <video ref={remoteRef} autoPlay playsInline style={{ flex: 2, background: '#000', minHeight: 0 }} />
          <video ref={localRef} autoPlay playsInline muted style={{ flex: 1, background: '#000', minHeight: 0 }} />
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); saveNote(e.target.value) }}
            placeholder="메모"
            style={{ height: 120, resize: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
