import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { Readiness, SessionSummary } from '../domain/types'
import { maskPhone } from '../domain/format'
import { nudgeMessage } from '../domain/nudgeMessage'

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

      {/*
        부르기는 준비상태와 무관하다. 경고 상자 안에 두면 준비상태 API 가 제대로
        동작하는 순간 준비된 아이는 부를 수 없게 된다.
      */}
      <p>
        <button onClick={async () => {
          const r = await api.nudge(session.sessionId)
          setNudgeResult(nudgeMessage(r))
        }}>
          아이 부르기
        </button>
        {nudgeResult && <span style={{ marginLeft: 12 }}>{nudgeResult}</span>}
      </p>

      {/* 준비 실패여도 시작할 수 있다. 설계 §6.3 */}
      <p><button onClick={onStart}>수업 시작</button></p>
    </div>
  )
}
