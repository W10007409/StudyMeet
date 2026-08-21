import { useState } from 'react'
import type { SessionSummary } from '../domain/types'

// 테스트용 고정값
const TEST_CUSTOMER_NUMBER = 'TEST-CHILD-001'
const TEST_ROOM_CODE = 'room-test-001'

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0F1923',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#E8ECF1',
    padding: '24px 16px',
  },
  header: {
    marginBottom: 40,
    textAlign: 'center' as const,
  },
  brand: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#E8ECF1',
  },
  brandAccent: {
    color: '#4ECDC4',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#7B8794',
    letterSpacing: '0.08em',
    fontWeight: 500,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#1A2634',
    borderRadius: 16,
    border: '1px solid rgba(78, 205, 196, 0.15)',
    overflow: 'hidden' as const,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0,0,0,0.2)',
  },
  quickBanner: {
    padding: '12px 20px',
    background: 'rgba(78, 205, 196, 0.06)',
    borderBottom: '1px solid rgba(78, 205, 196, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickBannerMeta: {
    flex: 1,
    minWidth: 0,
  },
  quickBannerLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#4ECDC4',
    textTransform: 'uppercase' as const,
    marginBottom: 2,
  },
  quickBannerValues: {
    fontSize: 11,
    color: '#7B8794',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  quickBannerBtn: (loading: boolean) => ({
    flexShrink: 0,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    background: loading ? 'rgba(78, 205, 196, 0.12)' : 'rgba(78, 205, 196, 0.18)',
    color: loading ? '#7B8794' : '#4ECDC4',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 150ms ease',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap' as const,
  }),
  section: {
    padding: '24px 24px 20px',
  },
  sectionLabel: {
    margin: '0 0 16px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: '#7B8794',
    textTransform: 'uppercase' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabelDot: (color: string) => ({
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 6px ${color}80`,
    flexShrink: 0,
  }),
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    display: 'block',
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 500,
    color: '#7B8794',
    letterSpacing: '0.02em',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    borderRadius: 8,
    border: '1px solid rgba(78, 205, 196, 0.2)',
    background: '#0F1923',
    color: '#E8ECF1',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 150ms ease, box-shadow 150ms ease',
    letterSpacing: '0.01em',
  },
  btnPush: (loading: boolean) => ({
    width: '100%',
    padding: '11px 16px',
    marginTop: 4,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    background: loading
      ? 'rgba(255, 230, 109, 0.08)'
      : 'rgba(255, 230, 109, 0.12)',
    color: loading ? '#7B8794' : '#FFE66D',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 150ms ease',
    letterSpacing: '0.03em',
    outline: '1px solid rgba(255, 230, 109, 0.2)',
    outlineOffset: 0,
  }),
  divider: {
    height: 1,
    background: 'rgba(78, 205, 196, 0.08)',
    margin: '0 24px',
  },
  btnEnter: {
    width: '100%',
    padding: '11px 16px',
    marginTop: 4,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    background: 'rgba(78, 205, 196, 0.15)',
    color: '#4ECDC4',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    letterSpacing: '0.03em',
    outline: '1px solid rgba(78, 205, 196, 0.3)',
    outlineOffset: 0,
  },
} as const

export function SessionList({ onEnter }: {
  onEnter: (s: SessionSummary) => void
}) {
  const [roomCode, setRoomCode] = useState(TEST_ROOM_CODE)
  const [customerNumber, setCustomerNumber] = useState(TEST_CUSTOMER_NUMBER)
  const [loading, setLoading] = useState(false)
  const [focusedInput, setFocusedInput] = useState<string | null>(null)

  const handleEnter = () => {
    if (!roomCode.trim()) {
      alert('방 코드를 입력해주세요')
      return
    }

    const session: SessionSummary = {
      sessionId: roomCode.trim(),
      studentName: '학생',
      studentId: 'student-' + roomCode.trim(),
      scheduledAt: new Date().toISOString(),
      durationMin: 60,
      bookTitle: '교재',
      status: 'IN_PROGRESS',
    }
    onEnter(session)
  }

  const handleSendPush = async () => {
    if (!customerNumber.trim()) {
      alert('고객번호를 입력해주세요')
      return
    }
    if (!roomCode.trim()) {
      alert('방 코드를 입력해주세요')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE || 'https://study-meet.wjthinkbig.com'}/api/push/lesson-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerNumber: customerNumber.trim(),
          roomCode: roomCode.trim(),
          teacherName: '선생님',
        }),
      })

      if (response.ok) {
        alert('수업 요청을 보냈습니다')
        setCustomerNumber('')
        setRoomCode('')
      } else {
        alert('수업 요청 실패: ' + response.statusText)
      }
    } catch (error) {
      alert('오류 발생: ' + (error instanceof Error ? error.message : '알 수 없는 오류'))
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAction = async () => {
    setCustomerNumber(TEST_CUSTOMER_NUMBER)
    setRoomCode(TEST_ROOM_CODE)
    await handleSendPush()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEnter()
    }
  }

  const inputStyle = (name: string) => ({
    ...styles.input,
    borderColor: focusedInput === name
      ? 'rgba(78, 205, 196, 0.5)'
      : 'rgba(78, 205, 196, 0.2)',
    boxShadow: focusedInput === name
      ? '0 0 0 3px rgba(78, 205, 196, 0.08)'
      : 'none',
  })

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sl-root { animation: fadeIn 280ms ease both; }
        .sl-card { animation: fadeIn 320ms 60ms ease both; }
        .sl-btn-push:hover:not(:disabled) {
          background: rgba(255, 230, 109, 0.2) !important;
          outline-color: rgba(255, 230, 109, 0.4) !important;
        }
        .sl-btn-enter:hover {
          background: rgba(78, 205, 196, 0.24) !important;
          outline-color: rgba(78, 205, 196, 0.5) !important;
        }
        .sl-btn-quick:hover:not(:disabled) {
          background: rgba(78, 205, 196, 0.28) !important;
          color: #4ECDC4 !important;
        }
      `}</style>

      <div style={styles.root} className="sl-root">
        {/* Header */}
        <header style={styles.header}>
          <h1 style={styles.brand}>
            Study<span style={styles.brandAccent}>Meet</span>
          </h1>
          <p style={styles.subtitle}>선생님 콘솔</p>
        </header>

        {/* Main card */}
        <div style={styles.card} className="sl-card">

          {/* Quick test banner */}
          <div style={styles.quickBanner}>
            <div style={styles.quickBannerMeta}>
              <div style={styles.quickBannerLabel}>빠른 테스트</div>
              <div style={styles.quickBannerValues}>
                {TEST_CUSTOMER_NUMBER} · {TEST_ROOM_CODE}
              </div>
            </div>
            <button
              className="sl-btn-quick"
              onClick={handleQuickAction}
              disabled={loading}
              style={styles.quickBannerBtn(loading)}
            >
              {loading ? '전송 중...' : '푸시 + 입장'}
            </button>
          </div>

          {/* Section 1: 수업 요청 */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>
              <span style={styles.sectionLabelDot('#FFE66D')} />
              수업 요청
            </p>

            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>아이 고객번호</label>
              <input
                type="text"
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                onFocus={() => setFocusedInput('customer')}
                onBlur={() => setFocusedInput(null)}
                placeholder="고객번호를 입력하세요"
                style={inputStyle('customer')}
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>방 코드</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onFocus={() => setFocusedInput('roomPush')}
                onBlur={() => setFocusedInput(null)}
                placeholder="방 코드를 입력하세요"
                style={inputStyle('roomPush')}
              />
            </div>

            <button
              className="sl-btn-push"
              onClick={handleSendPush}
              disabled={loading}
              style={styles.btnPush(loading)}
            >
              {loading ? '전송 중...' : '수업 요청 보내기'}
            </button>
          </div>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Section 2: 방 입장 */}
          <div style={styles.section}>
            <p style={styles.sectionLabel}>
              <span style={styles.sectionLabelDot('#4ECDC4')} />
              방 입장
            </p>

            <div style={styles.fieldGroup}>
              <label style={styles.fieldLabel}>방 코드</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onFocus={() => setFocusedInput('roomEnter')}
                onBlur={() => setFocusedInput(null)}
                onKeyPress={handleKeyPress}
                placeholder="방 코드를 입력하세요"
                style={inputStyle('roomEnter')}
              />
            </div>

            <button
              className="sl-btn-enter"
              onClick={handleEnter}
              style={styles.btnEnter}
            >
              방 입장
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
