import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0F1923',
    position: 'relative' as const,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#E8ECF1',
  },
  topBar: {
    padding: '0 20px',
    height: 52,
    background: '#1A2634',
    borderBottom: '1px solid rgba(78, 205, 196, 0.15)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    zIndex: 30,
  },
  studentInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  studentName: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#E8ECF1',
    letterSpacing: '-0.01em',
  },
  statusDot: (connected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: connected ? '#4ECDC4' : '#7B8794',
  }),
  topControls: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  touchBtn: (enabled: boolean) => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 6,
    border: enabled ? '1px solid rgba(78, 205, 196, 0.4)' : '1px solid rgba(123, 135, 148, 0.3)',
    cursor: 'pointer',
    background: enabled ? 'rgba(78, 205, 196, 0.12)' : 'rgba(123, 135, 148, 0.08)',
    color: enabled ? '#4ECDC4' : '#7B8794',
    transition: 'all 150ms ease',
    letterSpacing: '0.01em',
  }),
  endBtn: {
    padding: '6px 14px',
    background: 'rgba(255, 107, 107, 0.12)',
    color: '#FF6B6B',
    border: '1px solid rgba(255, 107, 107, 0.3)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.01em',
    transition: 'all 150ms ease',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
  },
  videoArea: {
    flex: 1,
    position: 'relative' as const,
    minWidth: 0,
  },
  liveKitWrapper: {
    width: '100%',
    height: '100%',
    background: '#0A1118',
    position: 'relative' as const,
    overflow: 'hidden',
    pointerEvents: 'none' as const,
  },
  touchOverlay: {
    position: 'absolute' as const,
    inset: 0,
    zIndex: 20,
  },
  touchBorder: (active: boolean) => ({
    position: 'absolute' as const,
    inset: 8,
    border: `1.5px dashed ${active ? 'rgba(78, 205, 196, 0.7)' : 'rgba(78, 205, 196, 0.12)'}`,
    borderRadius: 8,
    pointerEvents: 'none' as const,
    transition: 'border-color 120ms linear',
  }),
  touchIndicator: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '2px solid #4ECDC4',
    background: 'rgba(78, 205, 196, 0.15)',
    boxShadow: '0 0 16px rgba(78, 205, 196, 0.5)',
    opacity: 0,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none' as const,
    willChange: 'left, top, transform, opacity' as const,
  },
  statusBadges: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    display: 'flex',
    gap: 6,
    fontSize: 11,
    color: '#fff',
    pointerEvents: 'none' as const,
    zIndex: 25,
  },
  actionBadge: {
    background: 'rgba(26, 38, 52, 0.85)',
    border: '1px solid rgba(78, 205, 196, 0.25)',
    padding: '3px 8px',
    borderRadius: 4,
    backdropFilter: 'blur(4px)',
    letterSpacing: '0.01em',
    color: '#4ECDC4',
    fontSize: 11,
  },
  gestureBadge: {
    background: 'rgba(26, 38, 52, 0.85)',
    border: '1px solid rgba(78, 205, 196, 0.25)',
    padding: '3px 8px',
    borderRadius: 4,
    backdropFilter: 'blur(4px)',
    letterSpacing: '0.01em',
    color: '#E8ECF1',
    fontSize: 11,
  },
  pip: {
    position: 'absolute' as const,
    bottom: 16,
    left: 16,
    width: 152,
    height: 114,
    background: '#0A1118',
    borderRadius: 10,
    overflow: 'hidden',
    border: '1.5px solid rgba(78, 205, 196, 0.2)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0,0,0,0.3)',
    zIndex: 10,
  },
  pipVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
  sidebar: {
    flexShrink: 0,
    width: 272,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#1A2634',
    borderLeft: '1px solid rgba(78, 205, 196, 0.1)',
    minHeight: 0,
  },
  sidebarHeader: {
    padding: '14px 16px',
    borderBottom: '1px solid rgba(78, 205, 196, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#E8ECF1',
    letterSpacing: '0.02em',
  },
  sidebarDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4ECDC4',
    boxShadow: '0 0 6px rgba(78, 205, 196, 0.6)',
  },
  messageList: {
    flex: 1,
    overflow: 'auto' as const,
    padding: '12px 12px 8px',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  emptyState: {
    color: '#7B8794',
    fontSize: 13,
    textAlign: 'center' as const,
    marginTop: 32,
    lineHeight: 1.6,
  },
  messageBubble: (from: 'teacher' | 'student') => ({
    padding: '8px 10px',
    background: from === 'teacher' ? 'rgba(78, 205, 196, 0.1)' : 'rgba(232, 236, 241, 0.05)',
    border: from === 'teacher' ? '1px solid rgba(78, 205, 196, 0.2)' : '1px solid rgba(232, 236, 241, 0.08)',
    borderRadius: from === 'teacher' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
    alignSelf: from === 'teacher' ? 'flex-end' as const : 'flex-start' as const,
    maxWidth: '88%',
  }),
  messageMeta: {
    fontSize: 10,
    color: '#7B8794',
    marginBottom: 4,
    letterSpacing: '0.02em',
  },
  messageText: {
    fontSize: 13,
    color: '#E8ECF1',
    wordBreak: 'break-word' as const,
    lineHeight: 1.5,
  },
  inputArea: {
    padding: '10px 12px',
    borderTop: '1px solid rgba(78, 205, 196, 0.1)',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    padding: '8px 10px',
    border: '1px solid rgba(78, 205, 196, 0.15)',
    borderRadius: 6,
    fontSize: 13,
    background: 'rgba(15, 25, 35, 0.6)',
    color: '#E8ECF1',
    outline: 'none',
    transition: 'border-color 150ms ease',
  },
  sendBtn: {
    padding: '8px 14px',
    background: 'rgba(78, 205, 196, 0.15)',
    color: '#4ECDC4',
    border: '1px solid rgba(78, 205, 196, 0.3)',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    flexShrink: 0,
    transition: 'all 150ms ease',
    letterSpacing: '0.01em',
  },
} as const

export function Lesson({ session, onEnded }: {
  session: SessionSummary
  onEnded: () => void
}) {
  const [padInput, setPadInput] = useState('')
  const [messages, setMessages] = useState<{ from: 'teacher' | 'student'; text: string; time: string }[]>([])
  const [touchEnabled, setTouchEnabled] = useState(true)
  const [drawingEnabled, setDrawingEnabled] = useState(false)
  const [penColor, setPenColor] = useState('#4ECDC4')
  const [penWidth, setPenWidth] = useState(3)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([])
  const allStrokesRef = useRef<{ points: { x: number; y: number }[]; color: string; width: number }[]>([])

  const wsSend = useCallback((msg: any) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      console.error('[Touch] WebSocket not open, readyState:', ws?.readyState)
    }
  }, [])

  const onData = useCallback((msg: any) => {
    if (msg.type === 'pad_input') {
      const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [...prev, { from: msg.from, text: msg.text, time }])
    }
  }, [])

  const { localRef, send, connected } = useSession({
    signalingUrl: import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3000',
    room: session.sessionId,
    role: 'caller',
    onData,
    enabled: true,
  })

  useEffect(() => {
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:3000'
    const wsUrl = signalingUrl.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsUrl}/ws?room=${encodeURIComponent(session.sessionId)}`)
    wsRef.current = ws

    let frameInterval: ReturnType<typeof setInterval> | null = null
    const canvas = document.createElement('canvas')

    ws.onopen = () => {
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
      try {
        const msg = JSON.parse(event.data)
        onData(msg)
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    return () => {
      if (frameInterval) clearInterval(frameInterval)
      if (wsRef.current === ws) wsRef.current = null
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [session.sessionId, onData])

  const { surfaceProps, indicatorRef, status } = useTouchInput({
    send: wsSend,
    objectFit: 'contain',
    enabled: touchEnabled,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ─── Drawing (판서) ───

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const stroke of allStrokesRef.current) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const first = stroke.points[0]
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height)
      }
      ctx.stroke()
    }
  }, [])

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    currentStrokeRef.current = [{ x, y }]
    canvas.setPointerCapture(e.pointerId)
  }, [drawingEnabled])

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !drawingEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const prev = currentStrokeRef.current[currentStrokeRef.current.length - 1]
    currentStrokeRef.current.push({ x, y })

    // Draw the segment immediately
    ctx.beginPath()
    ctx.strokeStyle = penColor
    ctx.lineWidth = penWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(x * canvas.width, y * canvas.height)
    ctx.stroke()
  }, [drawingEnabled])

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const points = currentStrokeRef.current
    if (points.length >= 2) {
      const stroke = { points: [...points], color: penColor, width: penWidth }
      allStrokesRef.current.push(stroke)
      wsSend({ type: 'draw_stroke', points: stroke.points, color: stroke.color, width: stroke.width })
    }
    currentStrokeRef.current = []
  }, [wsSend])

  const clearDrawing = useCallback(() => {
    allStrokesRef.current = []
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
    wsSend({ type: 'draw_clear' })
  }, [wsSend])

  // Resize canvas to match video area
  useEffect(() => {
    if (!drawingEnabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const resize = () => {
      canvas.width = parent.clientWidth
      canvas.height = parent.clientHeight
      redrawCanvas()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [drawingEnabled, redrawCanvas])

  // When drawingEnabled turns on, disable touch; when off, re-enable touch
  useEffect(() => {
    if (drawingEnabled) {
      setTouchEnabled(false)
    }
  }, [drawingEnabled])

  const sendPadInput = () => {
    if (!padInput.trim()) return
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    setMessages((prev) => [...prev, { from: 'teacher', text: padInput, time }])
    // WebSocket으로 전송 (아이 오버레이에서 볼 수 있도록)
    wsSend({ type: 'pad_input', text: padInput, from: 'teacher' })
    setPadInput('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendPadInput()
    }
  }

  const handleEndLesson = () => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end_call' }))
    }
    onEnded()
  }

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.studentInfo}>
          <h2 style={styles.studentName}>{session.studentName}</h2>
          <div style={styles.statusDot(connected)}>
            <StatusDot connected={connected} />
            <span>{connected ? '연결됨' : '연결 안 됨'}</span>
          </div>
        </div>
        <div style={styles.topControls}>
          <button
            onClick={() => {
              setTouchEnabled((v) => !v)
              if (!touchEnabled) setDrawingEnabled(false)
            }}
            style={styles.touchBtn(touchEnabled)}
          >
            {touchEnabled ? '터치 ON' : '터치 OFF'}
          </button>
          <button
            onClick={() => setDrawingEnabled((v) => !v)}
            style={styles.touchBtn(drawingEnabled)}
          >
            {drawingEnabled ? '판서 중' : '판서'}
          </button>
          {drawingEnabled && (
            <>
              {/* 펜 색상 선택 */}
              {['#4ECDC4', '#FF6B6B', '#FFE66D', '#A8E6CF', '#FFFFFF'].map((c) => (
                <button
                  key={c}
                  onClick={() => setPenColor(c)}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', border: penColor === c ? '2px solid #fff' : '2px solid transparent',
                    background: c, cursor: 'pointer', padding: 0, boxShadow: penColor === c ? '0 0 6px rgba(255,255,255,0.4)' : 'none',
                  }}
                />
              ))}
              {/* 펜 굵기 선택 */}
              {[2, 4, 8].map((w) => (
                <button
                  key={w}
                  onClick={() => setPenWidth(w)}
                  style={{
                    width: 28, height: 28, borderRadius: 4, cursor: 'pointer', padding: 0,
                    background: penWidth === w ? 'rgba(78,205,196,0.3)' : 'rgba(255,255,255,0.1)',
                    border: penWidth === w ? '1px solid #4ECDC4' : '1px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ display: 'block', width: w * 2, height: w * 2, borderRadius: '50%', background: '#fff' }} />
                </button>
              ))}
              <button onClick={clearDrawing} style={styles.touchBtn(false)}>
                지우기
              </button>
            </>
          )}
          <button onClick={handleEndLesson} style={styles.endBtn}>
            수업 종료
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.mainContent}>
        {/* Video area */}
        <div style={styles.videoArea}>
          {/* LiveKit stream */}
          <div style={styles.liveKitWrapper}>
            <LiveKitView room={session.sessionId} identity="teacher" />
          </div>

          {/* Touch overlay */}
          <div
            {...surfaceProps}
            style={{ ...surfaceProps.style, ...styles.touchOverlay, pointerEvents: drawingEnabled ? 'none' : undefined }}
          >
            {touchEnabled && (
              <div style={styles.touchBorder(status.pointerCount > 0)} />
            )}
            <div ref={indicatorRef} style={styles.touchIndicator} />
          </div>

          {/* Drawing canvas overlay (판서) */}
          {drawingEnabled && (
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 22,
                cursor: 'crosshair',
                touchAction: 'none',
                background: 'transparent',
              }}
            />
          )}

          {/* Action / gesture badges */}
          {(status.lastAction || status.gesture) && (
            <div style={styles.statusBadges}>
              {status.lastAction && (
                <span style={styles.actionBadge}>
                  {ACTION_LABEL[status.lastAction] ?? status.lastAction}
                </span>
              )}
              {status.gesture && (
                <span style={styles.gestureBadge}>
                  {status.gesture === 'pinch'
                    ? `핀치 ×${status.scale.toFixed(2)}`
                    : '드래그'}
                </span>
              )}
            </div>
          )}

          {/* Teacher camera PIP */}
          <div style={styles.pip}>
            <video ref={localRef} autoPlay playsInline muted style={styles.pipVideo} />
          </div>
        </div>

        {/* Right sidebar — pad messages */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <div style={styles.sidebarDot} />
            <span style={styles.sidebarTitle}>패드</span>
          </div>

          <div style={styles.messageList}>
            {messages.length === 0 ? (
              <div style={styles.emptyState}>
                아직 메시지가 없습니다
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={styles.messageBubble(msg.from)}>
                  <div style={styles.messageMeta}>
                    {msg.from === 'teacher' ? '선생님' : '학생'} · {msg.time}
                  </div>
                  <div style={styles.messageText}>{msg.text}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={styles.inputArea}>
            <input
              type="text"
              value={padInput}
              onChange={(e) => setPadInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="메시지 입력..."
              style={styles.textInput}
            />
            <button onClick={sendPadInput} style={styles.sendBtn}>
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Animated connection status dot
function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
      <span style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: connected ? '#4ECDC4' : '#7B8794',
        animation: connected ? 'pulse-ring 2s ease-out infinite' : 'none',
        opacity: 0.4,
      }} />
      <span style={{
        position: 'relative',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: connected ? '#4ECDC4' : '#7B8794',
        boxShadow: connected ? '0 0 6px rgba(78, 205, 196, 0.7)' : 'none',
        display: 'inline-block',
      }} />
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </span>
  )
}
