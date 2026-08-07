import type { Readiness, SessionSummary } from '../domain/types'

/** 설계 §9의 6개 엔드포인트. 편성 시스템이 생기면 이 인터페이스 뒤가 바뀐다. */
export interface TeacherApi {
  listSessions(date: string): Promise<SessionSummary[]>
  getReadiness(sessionId: string): Promise<Readiness>
  /** 도달 여부를 반드시 돌려준다. iPad 는 APNs 키가 없으면 실패한다. 설계 §6.1. */
  nudge(sessionId: string): Promise<{ delivered: boolean; reason?: string }>
  endSession(sessionId: string, note: string, disconnectedSec: number): Promise<void>
  getToken(sessionId: string): Promise<{ signalingUrl: string; room: string; role: 'caller' | 'callee' }>
  revealContact(studentId: string): Promise<{ phone: string }>
}
