import type { Readiness, SessionSummary } from '../domain/types'
import type { TeacherApi } from './client'

/**
 * 계약 불일치: TeacherApi.listSessions(date) 에는 teacherId 가 없지만, 실제 라우트는
 * GET /teacher/:id/sessions?date=... 다 (scheduling/src/routes/teacher.ts). 편성 시스템이
 * 아직 로그인/현재 선생님 개념을 안 주므로, 인터페이스를 건드리지 않고 환경변수로 메운다.
 * http-swap-report.md 에 기록.
 */
function teacherId(): string {
  const id = import.meta.env.VITE_TEACHER_ID
  if (!id) throw new Error('VITE_TEACHER_ID 가 설정되지 않았다 — .env.local 을 확인하라')
  return id
}

/** 서버가 { error: string | ZodIssue[] } 형태로 보내는 메시지를 최대한 사람이 읽을 수 있게 뽑는다. */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body) {
      const { error } = body as { error: unknown }
      if (typeof error === 'string') return error
      return JSON.stringify(error)
    }
  } catch {
    // 본문이 JSON 이 아니었다 — statusText 로 대체한다.
  }
  return res.statusText
}

/**
 * 조용한 실패가 더 위험하다 — 선생님이 낡거나 없는 데이터를 보고도 모르는 상태가 되면 안 된다.
 * non-OK 응답은 상태 코드와 서버 메시지를 담아 던진다.
 */
async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const message = await extractErrorMessage(res)
    throw new Error(`${action} 실패 (HTTP ${res.status}): ${message}`)
  }
}

export function createHttpApi(baseUrl: string): TeacherApi {
  return {
    async listSessions(date) {
      const res = await fetch(`${baseUrl}/teacher/${teacherId()}/sessions?date=${encodeURIComponent(date)}`)
      await assertOk(res, '세션 목록 조회')
      return res.json() as Promise<SessionSummary[]>
    },

    async getReadiness(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/readiness`)
      await assertOk(res, '준비 상태 조회')
      return res.json() as Promise<Readiness>
    },

    /**
     * nudge 는 예외다: 백엔드는 전달 실패도 200 으로 돌려준다 (설계 §6.1, routes/session.ts).
     * 그 { delivered, reason? } 을 그대로 통과시킨다 — 실패를 에러로도, 성공으로도 바꾸지 않는다.
     * 세션을 못 찾는 등 진짜 HTTP 에러(404 등)는 다른 메서드와 똑같이 던진다.
     */
    async nudge(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/nudge`, { method: 'POST' })
      await assertOk(res, '알림 전송')
      return res.json() as Promise<{ delivered: boolean; reason?: string }>
    },

    async endSession(sessionId, note, disconnectedSec) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, disconnectedSec }),
      })
      await assertOk(res, '세션 종료')
    },

    async saveNote(sessionId, note) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      await assertOk(res, '메모 저장')
    },

    async getToken(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/token`)
      await assertOk(res, '접속 정보 조회')
      return res.json() as Promise<{ signalingUrl: string; room: string; role: 'caller' | 'callee' }>
    },

    async revealContact(studentId) {
      const res = await fetch(`${baseUrl}/contacts/${studentId}/reveal`, { method: 'POST' })
      await assertOk(res, '연락처 열람')
      return res.json() as Promise<{ phone: string }>
    },
  }
}
