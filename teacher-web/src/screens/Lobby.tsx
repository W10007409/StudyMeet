import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { Readiness, SessionSummary } from '../domain/types'
import { maskPhone } from '../domain/format'

export function Lobby({ api, session, onStart, onBack }: {
  api: TeacherApi
  session: SessionSummary
  onStart: () => void
  onBack: () => void
}) {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [nudgeResult, setNudgeResult] = useState<string | null>(null)

  useEffect(() => {
    void api.getReadiness(session.sessionId).then(setReadiness)
  }, [api, session.sessionId])

  const notReady = readiness && (!readiness.cameraGranted || !readiness.micGranted)

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← 목록</button>
      <h1>{session.studentName} · {session.bookTitle}</h1>

      {notReady && (
        <div style={{ background: '#fff4e5', padding: 16, borderRadius: 8 }}>
          <p>
            ⚠ {session.studentName}이(가){' '}
            {!readiness.cameraGranted ? '카메라' : '마이크'} 권한을 허용하지 않았어요
          </p>
          <button onClick={async () => {
            const r = await api.nudge(session.sessionId)
            // 도달 실패를 조용히 넘기지 않는다. 설계 §6.1
            setNudgeResult(r.delivered
              ? '알림을 보냈어요'
              : `알림이 전달되지 않았어요 — 연락처로 시도해 주세요${r.reason ? ` (${r.reason})` : ''}`)
          }}>
            알림 보내기
          </button>
          {nudgeResult && <span style={{ marginLeft: 12 }}>{nudgeResult}</span>}
          <div style={{ marginTop: 8 }}>
            연락처 {phone ?? maskPhone('010-1234-5678')}
            {!phone && (
              <button onClick={async () => {
                // 열람은 기록된다. 설계 §6.2
                const r = await api.revealContact(session.studentId)
                setPhone(r.phone)
              }}>
                보기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 준비 실패여도 시작할 수 있다. 설계 §6.3 */}
      <p><button onClick={onStart}>수업 시작</button></p>
    </div>
  )
}
