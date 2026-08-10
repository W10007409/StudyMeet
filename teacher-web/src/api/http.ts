import type { Readiness, SessionSummary } from '../domain/types'
import type { MakeupSlots, TeacherApi } from './client'

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
 * status 를 던지는 쪽에 실어 보낸다 — 409(슬롯 충돌 등, 선생님이 다른 시간을 고르면 회복되는 상황)와
 * 그 밖의 실패(서버 오류 등, 회복 방법이 다른 상황)를 화면이 구분할 수 있어야 한다.
 * 잃은 예약을 성공으로 오해하게 두는 것이 이 경로가 막으려는 실패다.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 조용한 실패가 더 위험하다 — 선생님이 낡거나 없는 데이터를 보고도 모르는 상태가 되면 안 된다.
 * non-OK 응답은 상태 코드와 서버 메시지를 담아 던진다.
 */
async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const message = await extractErrorMessage(res)
    throw new ApiError(res.status, `${action} 실패 (HTTP ${res.status}): ${message}`)
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

    async startSession(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/start`, { method: 'POST' })
      await assertOk(res, '수업 시작')
    },

    async heartbeat(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/heartbeat`, { method: 'POST' })
      await assertOk(res, '생존신호')
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

    /**
     * 마감을 넘긴 취소도 서버는 200 으로 받아 CANCELLED 대신 NO_SHOW 를 기록한다
     * (scheduling/src/routes/makeup.ts) — 늦은 취소는 오류가 아니므로 여기서도 던지지 않는다.
     * 이미 처리된 세션의 재취소(409)나 세션 없음(404)만 assertOk 가 던진다.
     */
    async cancelSession(sessionId) {
      const res = await fetch(`${baseUrl}/sessions/${sessionId}/cancel`, { method: 'POST' })
      await assertOk(res, '세션 취소')
      return res.json() as Promise<{ status: 'CANCELLED' | 'NO_SHOW' }>
    },

    async getMakeupSlots(from, to) {
      const res = await fetch(
        `${baseUrl}/teacher/${teacherId()}/makeup-slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      await assertOk(res, '보강 슬롯 조회')
      return res.json() as Promise<MakeupSlots>
    },

    /** 크레딧 없음(400)과 슬롯 충돌(409)을 서버가 구분해 보낸다 — assertOk 가 상태 코드를 실어 던진다. */
    async bookMakeup(enrollmentId, scheduledAt) {
      const res = await fetch(`${baseUrl}/makeups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollmentId, scheduledAt }),
      })
      await assertOk(res, '보강 예약')
    },
  }
}
