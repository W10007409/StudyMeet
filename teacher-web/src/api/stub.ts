import type { Readiness, SessionSummary } from '../domain/types'
import type { MakeupSlots, StudentCredit, TeacherApi } from './client'

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

  /** 편성 설계 §5.2 와 같은 값. 스텁이 서버 규칙을 다시 구현하지 않도록 여기서만 고정한다. */
  const CREDIT_WARN_THRESHOLD = 5

  // 크레딧 없음(e-nocred)과 정상(e-warn, 경고 임계 이상) 두 경로를 화면에서 바로 재현하기 위한 학생 둘.
  const students: StudentCredit[] = [
    {
      enrollmentId: 'e-nocred',
      studentId: 'stu-1',
      studentName: '김민준',
      creditBalance: 0,
      warn: false,
    },
    {
      enrollmentId: 'e-warn',
      studentId: 'stu-2',
      studentName: '이서연',
      creditBalance: 6,
      warn: true,
    },
  ]

  /** 15:00~20:00, 10분 그리드 — scheduling/src/domain/slots.ts 의 값을 스텁에서 다시 고정한 것. */
  function allTimesOfDay(): string[] {
    const out: string[] = []
    for (let h = 15; h < 20; h++) {
      for (let m = 0; m < 60; m += 10) {
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      }
    }
    return out
  }

  function dateRange(from: string, to: string): string[] {
    const out: string[] = []
    const cursor = new Date(`${from}T00:00:00Z`)
    const end = new Date(`${to}T00:00:00Z`)
    while (cursor.getTime() <= end.getTime()) {
      out.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return out
  }

  // "이미 찬 슬롯" 을 재현하기 위한 상태. 범위 조회 시 이 값을 빼고 보여주고,
  // 같은 시각을 다시 예약하려 하면 bookMakeup 이 충돌로 던진다.
  const bookedSlots = new Set<string>(['2026-08-10T15:00:00+09:00'])

  function slotKeyParts(iso: string): { date: string; time: string } {
    return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
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

    async cancelSession(sessionId) {
      const target = sessions.find((s) => s.sessionId === sessionId)
      if (target) target.status = 'CANCELLED'
      return { status: 'CANCELLED' }
    },

    async getMakeupSlots(from, to) {
      const bookedByDate = new Map<string, Set<string>>()
      for (const iso of bookedSlots) {
        const { date, time } = slotKeyParts(iso)
        if (!bookedByDate.has(date)) bookedByDate.set(date, new Set())
        bookedByDate.get(date)?.add(time)
      }

      const allTimes = allTimesOfDay()
      const slots = dateRange(from, to).map((date) => ({
        date,
        times: allTimes.filter((t) => !bookedByDate.get(date)?.has(t)),
      }))

      return { slots, students: students.map((s) => ({ ...s })) } satisfies MakeupSlots
    },

    async bookMakeup(enrollmentId, scheduledAt) {
      const student = students.find((s) => s.enrollmentId === enrollmentId)
      if (!student || student.creditBalance <= 0) {
        throw new Error('크레딧이 없습니다')
      }
      if (bookedSlots.has(scheduledAt)) {
        throw new Error('이미 예약된 시간입니다')
      }

      bookedSlots.add(scheduledAt)
      student.creditBalance -= 1
      student.warn = student.creditBalance >= CREDIT_WARN_THRESHOLD
    },
  }

  return api
}
