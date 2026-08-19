import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataMessage, SessionSummary } from '../domain/types'
import { useSession } from '../webrtc/useSession'
import { useTouchInput } from '../webrtc/useTouchInput'

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
  const [padInput, setPadInput] = useState('')
  const [messages, setMessages] = useState<{ from: 'teacher' | 'student'; text: string; time: string }[]>([])
  const [touchEnabled, setTouchEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const remoteImageRef = useRef<HTMLImageElement>(null)

  const onData = useCallback((msg: DataMessage) => {
    if (msg.type === 'pad_input') {
      const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      setMessages((prev) => [...prev, { from: msg.from, text: msg.text, time }])
    } else if (msg.type === 'camera_frame') {
      // Display camera frame from child device
      if (remoteImageRef.current && typeof msg.data === 'string') {
        remoteImageRef.current.src = `data:image/jpeg;base64,${msg.data}`
      }
    }
  }, [])

  const { localRef, remoteRef, send, connected } = useSession({
    signalingUrl: import.meta.env.VITE_SIGNALING_URL || 'ws://192.168.219.123:3000',
    room: session.sessionId,
    role: 'caller',
    onData,
    enabled: true,
  })

  // 영상은 object-fit: cover 라 잘린 부분이 있다. 훅이 그만큼 되돌려 원본 프레임 기준으로 보낸다.
  const { surfaceProps, indicatorRef, status } = useTouchInput({
    send,
    mediaRef: remoteImageRef,
    objectFit: 'cover',
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* 상단 바 */}
      <div style={{ padding: 16, background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{session.studentName}</h2>
        <button
          onClick={onEnded}
          style={{
            padding: '8px 16px',
            background: '#ff6b6b',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          수업 종료
        </button>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ flex: 1, display: 'flex', gap: 16, padding: 16, minHeight: 0 }}>
        {/* 좌측: 영상 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {/* 원격 비디오 (아이 카메라) + 터치 입력 영역 */}
          <div style={{ flex: 1, background: '#000', borderRadius: 8, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'none' }} />
            <img
              ref={remoteImageRef}
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              alt="Remote camera"
            />

            {/*
              터치 수신면. 영상 위에 정확히 겹쳐 두어야 좌표 기준이 영상과 같아진다.
              포인터 이벤트만 쓰고 touch-action: none 은 훅이 넣어 준다.
            */}
            <div
              {...surfaceProps}
              style={{ ...surfaceProps.style, position: 'absolute', inset: 0 }}
            >
              {/* 터치 가능 영역 표시 */}
              {touchEnabled && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 6,
                    border: `2px dashed ${status.pointerCount > 0 ? 'rgba(0,200,120,0.9)' : 'rgba(255,255,255,0.25)'}`,
                    borderRadius: 6,
                    pointerEvents: 'none',
                    transition: 'border-color 120ms linear',
                  }}
                />
              )}

              {/* 손끝 표식. 위치는 훅이 DOM 에 직접 써서 재렌더 없이 따라간다. */}
              <div
                ref={indicatorRef}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: 36,
                  height: 36,
                  marginLeft: 0,
                  marginTop: 0,
                  borderRadius: '50%',
                  border: '2px solid #00e08a',
                  background: 'rgba(0, 224, 138, 0.18)',
                  boxShadow: '0 0 12px rgba(0, 224, 138, 0.6)',
                  opacity: 0,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  willChange: 'left, top, transform, opacity',
                }}
              />
            </div>

            {/* 입력 상태 피드백 */}
            <div
              style={{
                position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6, alignItems: 'center',
                fontSize: 12, color: '#fff', pointerEvents: 'none',
              }}
            >
              <span style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4 }}>
                {touchEnabled ? (connected ? '터치 전송 중' : '터치 대기 (연결 안 됨)') : '터치 꺼짐'}
              </span>
              {status.lastAction && (
                <span style={{ background: 'rgba(0,102,204,0.85)', padding: '4px 8px', borderRadius: 4 }}>
                  {ACTION_LABEL[status.lastAction] ?? status.lastAction}
                </span>
              )}
              {status.gesture && (
                <span style={{ background: 'rgba(0,150,90,0.85)', padding: '4px 8px', borderRadius: 4 }}>
                  {status.gesture === 'pinch' ? `핀치 ×${status.scale.toFixed(2)}` : '드래그'}
                </span>
              )}
              {status.pointerCount > 1 && (
                <span style={{ background: 'rgba(120,0,160,0.85)', padding: '4px 8px', borderRadius: 4 }}>
                  {status.pointerCount}점
                </span>
              )}
            </div>

            <button
              onClick={() => setTouchEnabled((v) => !v)}
              style={{
                position: 'absolute', top: 8, right: 8, fontSize: 12, padding: '4px 8px',
                borderRadius: 4, border: 'none', cursor: 'pointer',
                background: touchEnabled ? '#00a06a' : '#555', color: '#fff',
              }}
            >
              {touchEnabled ? '터치 켜짐' : '터치 꺼짐'}
            </button>

            <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 12, color: '#fff', background: '#000', padding: '4px 8px', borderRadius: 4, pointerEvents: 'none' }}>
              🎥 아이 카메라 · 전송 {status.sentCount}
            </div>
          </div>
          {/* 로컬 비디오 (선생님 카메라) */}
          <div style={{ flex: '0 0 120px', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
            <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        {/* 우측: 패드 메시지 */}
        <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 8, border: '1px solid #ddd', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid #ddd', fontWeight: 'bold' }}>패드</div>

          {/* 메시지 영역 */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {messages.length === 0 ? (
              <div style={{ color: '#999', fontSize: 14, textAlign: 'center', marginTop: 20 }}>메시지가 없습니다</div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 12,
                    padding: 8,
                    background: msg.from === 'teacher' ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: 6,
                    alignSelf: msg.from === 'teacher' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    {msg.from === 'teacher' ? '선생님' : '학생'} {msg.time}
                  </div>
                  <div style={{ fontSize: 14, wordWrap: 'break-word' }}>{msg.text}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 */}
          <div style={{ padding: 12, borderTop: '1px solid #ddd', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={padInput}
              onChange={(e) => setPadInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="입력..."
              style={{
                flex: 1,
                padding: 8,
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 14,
              }}
            />
            <button
              onClick={sendPadInput}
              style={{
                padding: '8px 12px',
                background: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
