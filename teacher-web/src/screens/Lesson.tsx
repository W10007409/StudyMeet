import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../domain/types'
import { useSession } from '../webrtc/useSession'
import { useTouchInput } from '../webrtc/useTouchInput'
import { LiveKitView } from '../webrtc/LiveKitRoom'

const ACTION_LABEL: Record<string, string> = {
  down: '누름',
  move: '이동',
  up: '뗌',
  cancel: '취소',
  click: '탭',
  double_click: '더블탭',
}

export function Lesson({ session, onEnded }: {
  session: SessionSummary
  onEnded: () => void
}) {
  console.log('[Lesson] Component mounted, session:', session.sessionId)

  const [padInput, setPadInput] = useState('')
  const [messages, setMessages] = useState<{ from: 'teacher' | 'student'; text: string; time: string }[]>([])
  const [touchEnabled, setTouchEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // WebSocket으로 터치 이벤트 전송
  const wsSend = useCallback((msg: any) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg)
      console.log('[Touch] SENDING:', msg?.type, 'x:', msg?.x, 'y:', msg?.y, 'action:', msg?.action, 'url:', ws.url)
      ws.send(data)
    } else {
      console.warn('[Touch] WebSocket NOT open, wsRef:', !!wsRef.current, 'readyState:', ws?.readyState)
    }
  }, [])

  console.log('[Lesson] Refs created')

  const onData = useCallback((msg: any) => {
    console.log('[onData] Received message:', msg?.type, 'has data:', !!msg?.data)
    if (msg.type === 'pad_input') {
      console.log('[pad_input] Processing pad input')
      const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [...prev, { from: msg.from, text: msg.text, time }])
    } else {
      console.log('[onData] Unknown message type:', msg.type)
    }
  }, [])

  console.log('[useSession] Calling useSession hook...')
  const { localRef, send, connected } = useSession({
    signalingUrl: import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3000',
    room: session.sessionId,
    role: 'caller',
    onData,
    enabled: true,
  })
  console.log('[useSession] Hook returned, connected:', connected)

  // 시그널링 서버에서 직접 메시지 수신 (카메라 프레임, 화면 공유 등)
  useEffect(() => {
    console.log('[WebSocket] useEffect starting, sessionId:', session.sessionId)

    const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3000'
    console.log('[WebSocket] signalingUrl:', signalingUrl)

    const wsUrl = signalingUrl.replace(/^http/, 'ws')
    console.log('[WebSocket] Creating connection to:', `${wsUrl}/ws?room=${encodeURIComponent(session.sessionId)}`)

    const ws = new WebSocket(`${wsUrl}/ws?room=${encodeURIComponent(session.sessionId)}`)
    wsRef.current = ws
    console.log('[WebSocket] WebSocket object created')

    let frameInterval: ReturnType<typeof setInterval> | null = null
    const canvas = document.createElement('canvas')

    ws.onopen = () => {
      console.log('[WebSocket] ✅ Connected to signaling server:', wsUrl)

      // 선생님 카메라 프레임을 아이에게 전송 (2fps)
      frameInterval = setInterval(() => {
        const video = localRef.current
        if (!video || video.videoWidth === 0 || ws.readyState !== WebSocket.OPEN) return
        canvas.width = 240
        canvas.height = 180
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0, 240, 180)
        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1]
        ws.send(JSON.stringify({ type: 'teacher_camera_frame', data: base64 }))
      }, 200)
    }

    ws.onmessage = (event) => {
      console.log('[WebSocket] 📨 Raw message received, size:', event.data.length)
      try {
        const msg = JSON.parse(event.data)
        console.log('[WebSocket] ✅ Parsed message:', msg.type, 'data keys:', Object.keys(msg))
        // camera_frame, screen_frame 등 WebSocket으로 들어온 메시지 처리
        onData(msg)
      } catch (e) {
        console.error('[WebSocket] ❌ Failed to parse message:', e, 'raw:', event.data.substring(0, 100))
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] ❌ Error:', error)
    }

    ws.onclose = () => {
      console.log('[WebSocket] ❌ Disconnected')
    }

    console.log('[WebSocket] Event handlers attached')

    return () => {
      console.log('[WebSocket] Cleanup, closing connection')
      if (frameInterval) clearInterval(frameInterval)
      // wsRef가 이 ws를 가리킬 때만 null로 설정 (StrictMode 이중 실행 방지)
      if (wsRef.current === ws) wsRef.current = null
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [session.sessionId, onData])

  // 터치 좌표는 LiveKit 화면 공유 영역 기준으로 WebSocket을 통해 보낸다.
  const { surfaceProps, indicatorRef, status } = useTouchInput({
    send: wsSend,
    objectFit: 'contain',
    enabled: touchEnabled,
  })

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendPadInput = () => {
    if (!padInput.trim()) return

    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    setMessages((prev) => [...prev, { from: 'teacher', text: padInput, time }])

    send({ type: 'pad_input', text: padInput, from: 'teacher' })
    setPadInput('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendPadInput()
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1a1a2e', position: 'relative' }}>
      {/* 상단 바 */}
      <div style={{ padding: '10px 16px', background: '#16213e', borderBottom: '1px solid #0f3460', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#fff', fontSize: 16 }}>{session.studentName} 수업</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: connected ? '#00e08a' : '#ff6b6b' }}>
            {connected ? '● 연결됨' : '○ 연결 안 됨'}
          </span>
          <button
            onClick={() => setTouchEnabled((v) => !v)}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: touchEnabled ? '#00a06a' : '#555', color: '#fff',
            }}
          >
            {touchEnabled ? '터치 ON' : '터치 OFF'}
          </button>
          <button
            onClick={onEnded}
            style={{ padding: '6px 12px', background: '#ff6b6b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            수업 종료
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 좌측: 메인 영역 + 터치 입력 */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {/* LiveKit 비디오 (아이 카메라 + 화면 공유) */}
          <div style={{ width: '100%', height: '100%', background: '#111', position: 'relative', overflow: 'hidden', pointerEvents: 'none' }}>
            <LiveKitView room={session.sessionId} identity="teacher" />
          </div>

          {/* 터치 오버레이 - LiveKit 비디오 위에 z-index로 배치 */}
          <div
            {...surfaceProps}
            style={{ ...surfaceProps.style, position: 'absolute', inset: 0, zIndex: 20 }}
          >
            {touchEnabled && (
              <div style={{
                position: 'absolute', inset: 6,
                border: `2px dashed ${status.pointerCount > 0 ? 'rgba(0,200,120,0.9)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, pointerEvents: 'none', transition: 'border-color 120ms linear',
              }} />
            )}
            <div ref={indicatorRef} style={{
              position: 'absolute', left: '50%', top: '50%', width: 36, height: 36,
              borderRadius: '50%', border: '2px solid #00e08a', background: 'rgba(0, 224, 138, 0.18)',
              boxShadow: '0 0 12px rgba(0, 224, 138, 0.6)', opacity: 0,
              transform: 'translate(-50%, -50%)', pointerEvents: 'none',
              willChange: 'left, top, transform, opacity',
            }} />
          </div>

          {/* 상태 표시 */}
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, fontSize: 11, color: '#fff', pointerEvents: 'none' }}>
            {status.lastAction && (
              <span style={{ background: 'rgba(0,102,204,0.85)', padding: '3px 6px', borderRadius: 3 }}>
                {ACTION_LABEL[status.lastAction] ?? status.lastAction}
              </span>
            )}
            {status.gesture && (
              <span style={{ background: 'rgba(0,150,90,0.85)', padding: '3px 6px', borderRadius: 3 }}>
                {status.gesture === 'pinch' ? `핀치 ×${status.scale.toFixed(2)}` : '드래그'}
              </span>
            )}
          </div>

          {/* 선생님 카메라 (좌하단 PIP) */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, width: 160, height: 120,
            background: '#000', borderRadius: 8, overflow: 'hidden',
            border: '2px solid #0f3460', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 10,
          }}>
            <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 3, pointerEvents: 'none' }}>
              내 카메라
            </div>
          </div>
        </div>

        {/* 우측: 패드 메시지 */}
        <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', background: '#16213e', borderLeft: '1px solid #0f3460', minHeight: 0 }}>
          <div style={{ padding: 10, borderBottom: '1px solid #0f3460', fontWeight: 'bold', color: '#fff', fontSize: 14 }}>패드</div>

          <div style={{ flex: 1, overflow: 'auto', padding: 10, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 ? (
              <div style={{ color: '#555', fontSize: 13, textAlign: 'center', marginTop: 20 }}>메시지가 없습니다</div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={{
                  marginBottom: 8, padding: 8,
                  background: msg.from === 'teacher' ? '#0f3460' : '#1a1a2e',
                  borderRadius: 6, alignSelf: msg.from === 'teacher' ? 'flex-end' : 'flex-start', maxWidth: '90%',
                }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 3 }}>
                    {msg.from === 'teacher' ? '선생님' : '학생'} {msg.time}
                  </div>
                  <div style={{ fontSize: 13, color: '#ddd', wordWrap: 'break-word' }}>{msg.text}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: 10, borderTop: '1px solid #0f3460', display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={padInput}
              onChange={(e) => setPadInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="입력..."
              style={{ flex: 1, padding: 8, border: '1px solid #0f3460', borderRadius: 4, fontSize: 13, background: '#1a1a2e', color: '#fff' }}
            />
            <button
              onClick={sendPadInput}
              style={{ padding: '8px 12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
