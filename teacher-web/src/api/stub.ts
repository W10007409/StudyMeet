import type { Readiness, SessionSummary } from '../domain/types'
import type { TeacherApi } from './client'

export interface StubApi extends TeacherApi {
  lastEnd: { sessionId: string; note: string; disconnectedSec: number } | null
  lastNote: { sessionId: string; note: string } | null
}

/**
 * 편성 시스템(설계 §1.1의 A)이 없는 동안 쓰는 스텁.
 * 화면이 스텁에 맞추는 것이 아니라 스텁이 설계된 인터페이스를 흉내낸다.
 */
export function createStubApi(): StubApi {
  const sessions: SessionSummary[] = [
    {
      sessionId: 's1',
      studentName: '김민준',
      studentId: 'stu-1',
      scheduledAt: '2026-08-07T19:00:00+09:00',
      durationMin: 10,
      bookTitle: '마당을 나온 암탉',
      status: 'LOBBY_OPEN',
    },
    {
      sessionId: 's2',
      studentName: '이서연',
      studentId: 'stu-2',
      scheduledAt: '2026-08-07T19:20:00+09:00',
      durationMin: 10,
      bookTitle: '만복이네 떡집',
      status: 'SCHEDULED',
    },
  ]

  const readiness: Record<string, Readiness> = {
    s1: { cameraGranted: false, micGranted: true, networkOk: true, checkedAt: '2026-08-07T18:56:00+09:00' },
    s2: { cameraGranted: true, micGranted: true, networkOk: true, checkedAt: null },
  }

  const api: StubApi = {
    lastEnd: null,
    lastNote: null,

    async listSessions() {
      return [...sessions].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    },

    async getReadiness(sessionId) {
      return readiness[sessionId] ?? { cameraGranted: false, micGranted: false, networkOk: false, checkedAt: null }
    },

    async nudge() {
      return { delivered: true }
    },

    async endSession(sessionId, note, disconnectedSec) {
      api.lastEnd = { sessionId, note, disconnectedSec }
      const target = sessions.find((s) => s.sessionId === sessionId)
      if (target) target.status = 'ENDED'
    },

    async saveNote(sessionId, note) {
      api.lastNote = { sessionId, note }
    },

    async getToken(sessionId) {
      return {
        signalingUrl: import.meta.env.VITE_SIGNALING_URL ?? 'ws://localhost:8080',
        room: sessionId,
        role: 'caller',
      }
    },

    async revealContact() {
      return { phone: '010-1234-5678' }
    },
  }

  return api
}
