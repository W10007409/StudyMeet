/** 상위 설계 §4.2의 이탈 상태 모델. 화면 표시는 설계 §5의 표를 따른다. */
export type PresenceState = 'IN_CLASS' | 'PIP' | 'SCREEN_OFF' | 'DISCONNECTED'

export type SessionStatus = 'SCHEDULED' | 'LOBBY_OPEN' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED' | 'NO_SHOW'

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

/**
 * 터치 입력의 동작. down/move/up 은 원시 이벤트를 그대로 옮기고,
 * click/double_click 은 선생님 쪽에서 판정한 결과만 추가로 보낸다.
 */
export type TouchAction = 'down' | 'move' | 'up' | 'cancel' | 'click' | 'double_click'

export type PointerKind = 'mouse' | 'touch' | 'pen'

/**
 * 원격 영상 위의 한 점. x, y 는 화면 크기와 무관하도록 원본 프레임 기준 0~1 로 정규화한다.
 * object-fit 으로 잘려나간 영역까지 보정한 뒤의 값이라, 받는 쪽은 프레임 폭/높이만 곱하면 된다.
 */
export interface TouchInputMessage {
  type: 'touch_input'
  x: number
  y: number
  action: TouchAction
  /** 0~1. 압력을 보고하지 않는 장치는 눌린 동안 0.5 로 둔다. */
  pressure?: number
  /** 멀티터치를 구분하려는 수신자를 위한 포인터 식별자. */
  pointerId?: number
  pointerType?: PointerKind
  timestamp: number
}

export type GestureKind = 'drag' | 'pinch'
export type GesturePhase = 'start' | 'move' | 'end'

/** 두 손가락 핀치와 한 손가락 드래그. 좌표는 touch_input 과 같은 정규화 기준을 쓴다. */
export interface GestureInputMessage {
  type: 'gesture_input'
  gesture: GestureKind
  phase: GesturePhase
  /** 제스처의 중심점 (드래그는 현재 지점, 핀치는 두 점의 중간). */
  x: number
  y: number
  /** 드래그: 직전 이벤트 대비 이동량 (정규화 단위). */
  dx?: number
  dy?: number
  /** 핀치: 시작 시점 대비 배율. 1 보다 크면 벌린 것이다. */
  scale?: number
  /** 핀치: 시작 시점 대비 회전각(도). -180~180. */
  rotation?: number
  timestamp: number
}

/** 상위 설계 §9.1의 DataChannel 메시지. 서버는 이것을 해석하지 않는다. */
export type DataMessage =
  | { type: 'presence'; state: PresenceState; since: number }
  | { type: 'page_sync'; pageNo: number; counter: number; by: 'teacher' | 'student' }
  | { type: 'pointer'; x: number; y: number; action: 'down' | 'move' | 'up' }
  | { type: 'camera_state'; mode: 'FRONT_CLASS' | 'BACK_SHARED' | 'CAPTURING' }
  | { type: 'capture_done'; assetId: string }
  | { type: 'pad_input'; text: string; from: 'teacher' | 'student' }
  | { type: 'camera_frame'; data: string }
  | TouchInputMessage
  | GestureInputMessage

export interface PageState {
  pageNo: number
  counter: number
  by: 'teacher' | 'student'
}
