/** scheduling/prisma/schema.prisma 의 SessionStatus. teacher-web/src/domain/types.ts 와 같다. */
export type SessionStatus = 'SCHEDULED' | 'LOBBY_OPEN' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED' | 'NO_SHOW'

/**
 * 설계 §4.1, GET /operator/live 의 실제 응답(scheduling/src/routes/operator.ts).
 * 이름은 관측 가능한 것만 말한다 — 서버는 아이(학생) 쪽 연결을 볼 수 없다:
 *   - heartbeatLate: 선생님 브라우저의 생존신호가 30~90초 전. 아이 이야기가 아니다.
 *   - readinessUnknown: 프리체크 결과를 받는 경로가 없어 "확인 안 됨"을 세는 것이지,
 *     확인이 실패했다는 뜻이 아니다.
 */
export interface LiveSummary {
  inProgress: number
  heartbeatLate: number
  readinessUnknown: number
  stale: number
}

/** 설계 §4.2, GET /operator/today. */
export interface TodayCounts {
  date: string
  counts: Record<SessionStatus, number>
}

/** 설계 §4.3, GET /operator/not-ready. readiness 항목은 프리체크 파이프라인이 없어 항상 "확인 안 됨"이다. */
export interface NotReadyItem {
  sessionId: string
  studentName: string
  teacherName: string
  scheduledAt: string
  readiness: {
    cameraGranted: boolean
    micGranted: boolean
    networkOk: boolean
    checkedAt: string | null
  }
}

/** 설계 §4.4, GET /operator/credit-warnings. */
export interface CreditWarning {
  enrollmentId: string
  studentName: string
  teacherName: string
  bookTitle: string
  creditBalance: number
}

/** 설계 §4.5, GET /operator/sessions. */
export interface SessionSearchResult {
  sessionId: string
  studentName: string
  teacherName: string
  scheduledAt: string
  status: SessionStatus
}

/** api/http.ts 의 로딩/오류/완료를 화면이 구분해 그리기 위한 공통 형태. 결정 #3. */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T }
