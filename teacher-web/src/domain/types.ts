/** 상위 설계 §4.2의 이탈 상태 모델. 화면 표시는 설계 §5의 표를 따른다. */
export type PresenceState = 'IN_CLASS' | 'PIP' | 'SCREEN_OFF' | 'DISCONNECTED'

export type SessionStatus = 'SCHEDULED' | 'LOBBY_OPEN' | 'IN_PROGRESS' | 'ENDED'

export interface SessionSummary {
  sessionId: string
  studentName: string
  studentId: string
  scheduledAt: string
  durationMin: number
  bookTitle: string
  status: SessionStatus
}

export interface Readiness {
  cameraGranted: boolean
  micGranted: boolean
  networkOk: boolean
  checkedAt: string | null
}

/** 상위 설계 §9.1의 DataChannel 메시지. 서버는 이것을 해석하지 않는다. */
export type DataMessage =
  | { type: 'presence'; state: PresenceState; since: number }
  | { type: 'page_sync'; pageNo: number; counter: number; by: 'teacher' | 'student' }
  | { type: 'pointer'; x: number; y: number; action: 'down' | 'move' | 'up' }
  | { type: 'camera_state'; mode: 'FRONT_CLASS' | 'BACK_SHARED' | 'CAPTURING' }
  | { type: 'capture_done'; assetId: string }

export interface PageState {
  pageNo: number
  counter: number
  by: 'teacher' | 'student'
}
