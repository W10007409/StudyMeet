import type { Readiness, SessionSummary } from '../domain/types'

export interface StudentCredit {
  enrollmentId: string
  studentId: string
  studentName: string
  creditBalance: number
  /** 편성 설계 §5.2 — 소진할 슬롯이 유한하므로 쌓이면 경고한다. */
  warn: boolean
}

export interface MakeupSlots {
  slots: { date: string; times: string[] }[]
  students: StudentCredit[]
}

/** 설계 §9의 6개 엔드포인트. 편성 시스템이 생기면 이 인터페이스 뒤가 바뀐다. */
export interface TeacherApi {
  listSessions(date: string): Promise<SessionSummary[]>
  getReadiness(sessionId: string): Promise<Readiness>
  /** 도달 여부를 반드시 돌려준다. iPad 는 APNs 키가 없으면 실패한다. 설계 §6.1. */
  nudge(sessionId: string): Promise<{ delivered: boolean; reason?: string }>
  endSession(sessionId: string, note: string, disconnectedSec: number): Promise<void>
  /** 메모 중간 저장. 종료 전에 잃지 않기 위한 것이다. */
  saveNote(sessionId: string, note: string): Promise<void>
  getToken(sessionId: string): Promise<{ signalingUrl: string; room: string; role: 'caller' | 'callee' }>
  revealContact(studentId: string): Promise<{ phone: string }>
  /** 마감을 넘겨도 거부되지 않는다. 서버가 CANCELLED 인지 NO_SHOW 인지 알려준다. */
  cancelSession(sessionId: string): Promise<{ status: 'CANCELLED' | 'NO_SHOW' }>
  getMakeupSlots(from: string, to: string): Promise<MakeupSlots>
  bookMakeup(enrollmentId: string, scheduledAt: string): Promise<void>
}
