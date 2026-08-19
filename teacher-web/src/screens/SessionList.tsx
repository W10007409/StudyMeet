import { useState } from 'react'
import type { SessionSummary } from '../domain/types'

// 테스트용 고정값
const TEST_CUSTOMER_NUMBER = 'TEST-CHILD-001'
const TEST_ROOM_CODE = 'room-test-001'

export function SessionList({ onEnter }: {
  onEnter: (s: SessionSummary) => void
}) {
  const [roomCode, setRoomCode] = useState(TEST_ROOM_CODE)
  const [customerNumber, setCustomerNumber] = useState(TEST_CUSTOMER_NUMBER)
  const [loading, setLoading] = useState(false)

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
      const response = await fetch('http://192.168.219.123:3000/api/push/lesson-request', {
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEnter()
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <h1>수업 시작</h1>

      {/* 테스트 버튼 */}
      <div style={{
        marginBottom: 24,
        padding: 16,
        background: '#fff3cd',
        borderRadius: 8,
        border: '2px solid #ffc107',
      }}>
        <p style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 'bold', color: '#856404' }}>
          ⚡ 빠른 테스트 (고객번호: {TEST_CUSTOMER_NUMBER}, 방코드: {TEST_ROOM_CODE})
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSendPush}
            disabled={loading}
            style={{
              flex: 1,
              padding: 10,
              fontSize: 14,
              fontWeight: 'bold',
              borderRadius: 4,
              border: 'none',
              background: loading ? '#ccc' : '#ff9800',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '전송 중...' : '📱 푸시 보내기'}
          </button>
          <button
            onClick={handleEnter}
            style={{
              flex: 1,
              padding: 10,
              fontSize: 14,
              fontWeight: 'bold',
              borderRadius: 4,
              border: 'none',
              background: '#2196F3',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            🎥 방 입장
          </button>
        </div>
      </div>

      {/* 섹션 1: 수업 요청 */}
      <div style={{
        marginBottom: 32,
        padding: 20,
        background: '#f9f9f9',
        borderRadius: 8,
        border: '1px solid #e0e0e0',
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: '#333' }}>아이에게 수업 요청 보내기</h2>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>아이 고객번호:</label>
          <input
            type="text"
            value={customerNumber}
            onChange={(e) => setCustomerNumber(e.target.value)}
            placeholder="고객번호를 입력하세요"
            style={{
              width: '100%',
              padding: 10,
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>방 코드:</label>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="방 코드를 입력하세요"
            style={{
              width: '100%',
              padding: 10,
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={handleSendPush}
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 16,
            fontWeight: 'bold',
            borderRadius: 4,
            border: 'none',
            background: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.3s',
          }}
        >
          {loading ? '전송 중...' : '📱 수업 요청 보내기'}
        </button>
      </div>

      {/* 섹션 2: 방 입장 */}
      <div style={{
        padding: 20,
        background: '#f0f8ff',
        borderRadius: 8,
        border: '1px solid #b3d9ff',
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: '#333' }}>직접 방 입장하기</h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>방 코드:</label>
          <input
            type="text"
            placeholder="방 코드를 입력하세요"
            onKeyPress={handleKeyPress}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 14,
              borderRadius: 4,
              border: '1px solid #ccc',
              boxSizing: 'border-box',
            }}
            onChange={(e) => setRoomCode(e.target.value)}
            value={roomCode}
          />
        </div>

        <button
          onClick={handleEnter}
          style={{
            width: '100%',
            padding: 12,
            fontSize: 16,
            fontWeight: 'bold',
            borderRadius: 4,
            border: 'none',
            background: '#0066cc',
            color: 'white',
            cursor: 'pointer',
            transition: 'background 0.3s',
          }}
        >
          🎥 방 입장
        </button>
      </div>
    </div>
  )
}
