# 선생님 수업 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님이 PC 브라우저에서 오늘 수업 목록을 보고, 대기실에서 학생 준비 상태를 확인하고, 아이와 화상으로 연결해 같은 책을 넘겨 가며 10분 수업을 진행하고, 메모를 남기고 끝내는 화면을 만든다.

**Architecture:** React + TypeScript + Vite 단일 페이지 앱. 화상은 Phase 0에서 실동작 검증된 `signaling/public/teacher.html` 의 WebRTC 코드를 승계한다. 편성 시스템이 없으므로 6개 엔드포인트 뒤에 스텁을 두고, 그 인터페이스만 고정한다. 순수 로직(LWW 페이지 동기화, 이탈 상태 판정, 시간 포맷, 연락처 마스킹)은 UI와 분리해 단위 테스트로 먼저 만든다.

**Tech Stack:** React 19.2.8 · TypeScript 7.0.2 · Vite 8.2.1 · Vitest 4.1.10 · @testing-library/react 16.3.2 · Node 22

**설계 문서:** `docs/superpowers/specs/2026-08-07-teacher-lesson-screen-design.md` (이하 "설계"). 상위 설계는 `2026-08-06-studymeet-video-tutoring-design.md`.

---

## Global Constraints

- **미디어 객체를 React state에 넣지 않는다.** `MediaStream`, `RTCPeerConnection`, `RTCDataChannel`, 시그널링 `WebSocket` 은 전부 `useRef` 로 보관한다. 재렌더가 `<video>` 의 `srcObject` 를 떼었다 붙이면 영상이 끊긴다. state에 두는 것은 화면에 그리는 값뿐이다 — 이탈 상태, 경과 시간, 누적 끊김 시간, 페이지 번호, 메모 텍스트. (설계 §10.1)
- 대상 해상도 **최소 1280px 폭**. 반응형은 하지 않는다. 태블릿·모바일 지원 없음. (설계 §1.2)
- 레이아웃 비율 **좌 58% 학습화면 / 우 42% 영상·메모**. (설계 §3)
- **자동 전환·자동 시작·자동 종료를 만들지 않는다.** 모든 진행은 선생님의 클릭에서 시작한다. (설계 §2)
- 이탈 상태 관련 **조작 버튼을 만들지 않는다.** 배지와 타이머만. (설계 §5.1)
- 비디오 **480×270 / 24fps** — 상위 설계 §3.1의 기본 화질.
- 시그널링 주소·TURN 자격증명은 **`.env.local` 에만** 둔다. `.env.local` 은 gitignore한다. **자격증명을 절대 커밋하지 않는다.**
- 편성 시스템 스텁의 응답 형태는 설계 §9를 그대로 따른다. 화면이 스텁에 맞추는 것이 아니라 **스텁이 설계된 인터페이스를 흉내내는 것**이다.

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Task 1–7 전부 | Node 22 + 브라우저. **현재 Windows 머신에서 전부 실행 가능** |
| 두 피어 연결 확인 | 브라우저 창 2개 (선생님 화면 + Phase 0의 `teacher.html`) 또는 Android 태블릿 |

이 계획은 Phase 0과 달리 **하드웨어 블로커가 없다.** 실기기는 아이 앱과 붙일 때만 필요하고, 그 전까지는 Phase 0의 `teacher.html` 이 상대 피어 역할을 한다.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `teacher-web/package.json` | 의존성·스크립트 |
| `teacher-web/vite.config.ts` | Vite + React 플러그인 + Vitest 설정 |
| `teacher-web/tsconfig.json` | TypeScript 설정 |
| `teacher-web/.env.example` | 환경변수 견본 (커밋함) |
| `teacher-web/src/domain/types.ts` | 세션·학생·이탈상태·DataChannel 메시지 타입 |
| `teacher-web/src/domain/pageSync.ts` | LWW 페이지 동기화. 순수 함수 |
| `teacher-web/src/domain/presence.ts` | 이탈 상태 판정과 누적 끊김 누산. 순수 함수 |
| `teacher-web/src/domain/format.ts` | 경과 시간 포맷, 연락처 마스킹. 순수 함수 |
| `teacher-web/src/api/client.ts` | 6개 엔드포인트 호출 |
| `teacher-web/src/api/stub.ts` | 편성 시스템 스텁 |
| `teacher-web/src/webrtc/useSession.ts` | 시그널링 + PeerConnection. 전부 ref |
| `teacher-web/src/screens/SessionList.tsx` | 오늘 수업 목록 |
| `teacher-web/src/screens/Lobby.tsx` | 대기실 |
| `teacher-web/src/screens/Lesson.tsx` | 수업 화면 |
| `teacher-web/src/components/*.tsx` | 상단바, 이탈 배지, 학습화면 뷰어, 메모 |
| `teacher-web/src/**/*.test.ts` | 순수 로직 단위 테스트 |

---

## Task 1: 프로젝트 골격과 툴체인 검증

TypeScript 7은 네이티브 포트라 플러그인 호환이 고를 수 있다. **다른 무엇보다 먼저 툴체인이 실제로 도는지 확인한다.**

**Files:**
- Create: `teacher-web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.env.example`
- Create: `teacher-web/src/main.tsx`, `teacher-web/src/App.tsx`
- Create: `teacher-web/src/smoke.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: `npm run dev` / `npm run build` / `npm test` 가 도는 프로젝트

- [ ] **Step 1: 패키지 정의**

Create `teacher-web/package.json`:

```json
{
  "name": "studymeet-teacher-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@testing-library/react": "16.3.2",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "vite": "8.2.1",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: 설정 파일**

Create `teacher-web/vite.config.ts`:

```typescript
// defineConfig 는 'vitest/config' 에서 가져온다. 'vite' 쪽에는 test 필드 타입이 없어
// tsc 가 TS2769 로 죽는다. TypeScript 버전과 무관한 문제다.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Create `teacher-web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `teacher-web/index.html`:

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>StudyMeet 선생님</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `teacher-web/.env.example`:

```
# 실제 값은 .env.local 에 둔다. .env.local 은 커밋하지 않는다.
VITE_SIGNALING_URL=ws://localhost:8080
VITE_API_BASE=http://localhost:8080/api
# TURN 은 선택. 없으면 STUN 만 쓴다.
VITE_TURN_URL=
VITE_TURN_USER=
VITE_TURN_PASS=
```

Modify `.gitignore` — 파일 끝에 추가:

```
teacher-web/node_modules/
teacher-web/dist/
teacher-web/.env.local
```

- [ ] **Step 3: 최소 앱과 스모크 테스트**

Create `teacher-web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Create `teacher-web/src/App.tsx`:

```tsx
export function App() {
  return <h1>StudyMeet 선생님</h1>
}
```

Create `teacher-web/src/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript and Vitest together', () => {
    const answer: number = 1 + 1
    expect(answer).toBe(2)
  })
})
```

- [ ] **Step 4: 툴체인이 실제로 도는지 확인 — 이 계획의 첫 관문**

```bash
cd teacher-web && npm install
npm test
npm run build
```

Expected: `npm test` 는 1 passed, `npm run build` 는 `tsc --noEmit` 통과 후 `dist/` 생성.

> `@types/react` 와 `@types/react-dom` 은 React 자체와 **버전이 따로 논다.** React가 19.2.8이어도 타입 패키지는 각각 19.2.18과 19.2.4다. 같은 번호일 것이라 가정하면 `npm install` 이 `ETARGET` 으로 죽는다.

**TypeScript 7 관련 오류가 나면 여기서 멈추고 보고한다.** 흔한 증상: `@vitejs/plugin-react` 나 `vitest` 가 TS 7의 타입 정의를 못 읽음, `tsc` 가 알 수 없는 옵션을 거부함.

그 경우 대응은 하나다 — `package.json` 의 `typescript` 를 `6.0.3` 으로 낮추고 `npm install` 후 Step 4를 다시 실행한다. **다른 패키지 버전은 건드리지 않는다.** 낮췄다는 사실과 정확한 오류 메시지를 보고한다.

- [ ] **Step 5: `node_modules` 가 스테이징되지 않았는지 확인하고 커밋**

```bash
git status --short
git add .gitignore teacher-web
git commit -m "feat(teacher-web): scaffold React + TypeScript + Vite"
```

`git status --short` 출력에 `teacher-web/node_modules` 가 보이면 `.gitignore` 가 안 먹은 것이다. 커밋하지 말고 고친다.

---

## Task 2: 도메인 타입과 순수 로직 (TDD)

UI를 만들기 전에 판단 로직을 분리해 테스트로 고정한다. 여기 있는 것은 전부 순수 함수이며 React를 모른다.

**Files:**
- Create: `teacher-web/src/domain/types.ts`
- Create: `teacher-web/src/domain/pageSync.ts` + `pageSync.test.ts`
- Create: `teacher-web/src/domain/presence.ts` + `presence.test.ts`
- Create: `teacher-web/src/domain/format.ts` + `format.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `PresenceState = 'IN_CLASS' | 'PIP' | 'SCREEN_OFF' | 'DISCONNECTED'`
  - `DataMessage` 유니온 타입
  - `applyPageSync(current, incoming): PageState`
  - `accumulateDisconnected(prev, state, elapsedMs): number`
  - `formatElapsed(ms): string`, `maskPhone(phone): string`

- [ ] **Step 1: 타입 정의**

Create `teacher-web/src/domain/types.ts`:

```typescript
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
```

- [ ] **Step 2: 페이지 동기화 실패 테스트 작성**

Create `teacher-web/src/domain/pageSync.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { applyPageSync, nextLocalPage } from './pageSync'
import type { PageState } from './types'

const at = (pageNo: number, counter: number, by: PageState['by']): PageState =>
  ({ pageNo, counter, by })

describe('applyPageSync', () => {
  it('더 큰 counter 를 받으면 적용한다', () => {
    expect(applyPageSync(at(1, 1, 'teacher'), at(5, 2, 'student')))
      .toEqual(at(5, 2, 'student'))
  })

  it('더 작은 counter 는 무시한다 — 늦게 도착한 옛 조작', () => {
    expect(applyPageSync(at(5, 9, 'teacher'), at(2, 3, 'student')))
      .toEqual(at(5, 9, 'teacher'))
  })

  it('counter 가 같으면 무시한다 — 이미 적용된 것', () => {
    expect(applyPageSync(at(5, 9, 'teacher'), at(7, 9, 'student')))
      .toEqual(at(5, 9, 'teacher'))
  })
})

describe('nextLocalPage', () => {
  it('내가 넘기면 counter 를 올리고 by 를 teacher 로 둔다', () => {
    expect(nextLocalPage(at(3, 7, 'student'), 4)).toEqual(at(4, 8, 'teacher'))
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd teacher-web && npm test
```
Expected: FAIL — `Cannot find module './pageSync'`

- [ ] **Step 4: 구현**

Create `teacher-web/src/domain/pageSync.ts`:

```typescript
import type { PageState } from './types'

/**
 * 마지막 조작 우선(LWW). 설계 §7.1.
 * 양방향 동기화라 두 쪽이 동시에 넘길 수 있고, 늦게 도착한 옛 조작이
 * 새 상태를 덮으면 화면이 뒤로 튄다. counter 로만 판단한다.
 */
export function applyPageSync(current: PageState, incoming: PageState): PageState {
  return incoming.counter > current.counter ? incoming : current
}

/** 선생님이 직접 넘길 때. counter 를 하나 올린다. */
export function nextLocalPage(current: PageState, pageNo: number): PageState {
  return { pageNo, counter: current.counter + 1, by: 'teacher' }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```
Expected: PASS — 5 passed (스모크 테스트 1개 포함)

- [ ] **Step 6: 이탈 상태 누산 테스트 작성**

Create `teacher-web/src/domain/presence.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { accumulateDisconnected, isAway } from './presence'

describe('accumulateDisconnected', () => {
  it('연결이 끊긴 동안만 누산한다', () => {
    expect(accumulateDisconnected(1000, 'DISCONNECTED', 500)).toBe(1500)
  })

  it('PIP 는 끊김이 아니다 — 화상이 살아 있다', () => {
    expect(accumulateDisconnected(1000, 'PIP', 500)).toBe(1000)
  })

  it('화면 꺼짐도 끊김이 아니다 — 오디오가 살아 있다', () => {
    expect(accumulateDisconnected(1000, 'SCREEN_OFF', 500)).toBe(1000)
  })

  it('정상 상태에서는 그대로 둔다', () => {
    expect(accumulateDisconnected(1000, 'IN_CLASS', 500)).toBe(1000)
  })
})

describe('isAway', () => {
  it('IN_CLASS 만 자리에 있는 것으로 본다', () => {
    expect(isAway('IN_CLASS')).toBe(false)
    expect(isAway('PIP')).toBe(true)
    expect(isAway('SCREEN_OFF')).toBe(true)
    expect(isAway('DISCONNECTED')).toBe(true)
  })
})
```

- [ ] **Step 7: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './presence'`

Create `teacher-web/src/domain/presence.ts`:

```typescript
import type { PresenceState } from './types'

/**
 * 누적 끊김 시간. 설계 §5.2.
 * PIP 와 SCREEN_OFF 는 이탈이지만 연결은 살아 있으므로 누산하지 않는다.
 * 선생님이 시간 보상을 판단하는 근거이므로 "화상이 실제로 끊긴 시간"만 센다.
 */
export function accumulateDisconnected(
  prevMs: number,
  state: PresenceState,
  elapsedMs: number,
): number {
  return state === 'DISCONNECTED' ? prevMs + elapsedMs : prevMs
}

/** 배지를 띄울지 판단한다. IN_CLASS 외에는 전부 무언가 표시한다. */
export function isAway(state: PresenceState): boolean {
  return state !== 'IN_CLASS'
}
```

```bash
npm test
```
Expected: PASS — 10 passed

- [ ] **Step 8: 포맷 테스트 작성**

Create `teacher-web/src/domain/format.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatElapsed, maskPhone } from './format'

describe('formatElapsed', () => {
  it('분:초로 만든다', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(600_000)).toBe('10:00')
  })

  it('한 시간을 넘어도 분으로 센다 — 하드 타임아웃이 30분이라 시간 단위가 필요 없다', () => {
    expect(formatElapsed(3_900_000)).toBe('65:00')
  })

  it('음수는 00:00 으로 막는다', () => {
    expect(formatElapsed(-1)).toBe('00:00')
  })
})

describe('maskPhone', () => {
  it('가운데를 가린다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678')
  })

  it('하이픈이 없어도 처리한다', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678')
  })

  it('알 수 없는 형식은 통째로 가린다 — 실수로 노출하느니 못 쓰는 편이 낫다', () => {
    expect(maskPhone('unknown')).toBe('***')
  })
})
```

- [ ] **Step 9: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './format'`

Create `teacher-web/src/domain/format.ts`:

```typescript
/** 경과·이탈·끊김 시간 표시. 설계 §3. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * 연락처 마스킹. 설계 §6.2.
 * 아동 개인정보이므로 기본은 가린 상태이고, 형식을 알 수 없으면 아무것도 보여주지 않는다.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11) return '***'
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-****-${tail}`
}
```

```bash
npm test
```
Expected: PASS — 16 passed

- [ ] **Step 10: 커밋**

```bash
git add teacher-web/src/domain
git commit -m "feat(teacher-web): add domain types and pure logic with tests"
```

---

## Task 3: 편성 시스템 스텁과 API 클라이언트

**Files:**
- Create: `teacher-web/src/api/client.ts`
- Create: `teacher-web/src/api/stub.ts` + `stub.test.ts`

> 설계 §9는 엔드포인트 **7개**를 정의한다. 이 태스크는 그중 6개를 만들고, 메모 중간 저장(`PUT /sessions/{id}/note`)은 자동 저장을 붙이는 Task 7에서 함께 더한다.

**Interfaces:**
- Consumes: `SessionSummary`, `Readiness` (Task 2)
- Produces: 설계 §9의 7개 엔드포인트를 감싼 `TeacherApi`. Task 3에서 6개를 만들고, `saveNote` 는 Task 7에서 더한다

- [ ] **Step 1: 스텁 테스트 작성**

Create `teacher-web/src/api/stub.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createStubApi } from './stub'

describe('createStubApi', () => {
  it('오늘 수업 목록을 시간순으로 준다', async () => {
    const api = createStubApi()
    const list = await api.listSessions('2026-08-07')
    expect(list.length).toBeGreaterThan(0)
    const times = list.map((s) => s.scheduledAt)
    expect([...times].sort()).toEqual(times)
  })

  it('nudge 결과에 도달 여부가 담긴다 — 조용히 성공한 척하지 않는다', async () => {
    const api = createStubApi()
    const result = await api.nudge('s1')
    expect(result).toHaveProperty('delivered')
  })

  it('종료하면 메모와 끊김 시간을 받아 둔다', async () => {
    const api = createStubApi()
    await api.endSession('s1', '집중 잘함', 24)
    expect(api.lastEnd).toEqual({ sessionId: 's1', note: '집중 잘함', disconnectedSec: 24 })
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npm test
```
Expected: FAIL — `Cannot find module './stub'`

- [ ] **Step 3: 클라이언트 인터페이스 정의**

Create `teacher-web/src/api/client.ts`:

```typescript
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
```

- [ ] **Step 4: 스텁 구현**

Create `teacher-web/src/api/stub.ts`:

```typescript
import type { Readiness, SessionSummary } from '../domain/types'
import type { TeacherApi } from './client'

export interface StubApi extends TeacherApi {
  lastEnd: { sessionId: string; note: string; disconnectedSec: number } | null
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
```

- [ ] **Step 5: 통과 확인과 커밋**

```bash
npm test
```
Expected: PASS — 19 passed

```bash
git add teacher-web/src/api
git commit -m "feat(teacher-web): add the scheduling stub behind the designed interface"
```

---

## Task 4: WebRTC 세션 훅

Phase 0의 `signaling/public/teacher.html` 을 React 훅으로 옮긴다. **미디어 객체는 전부 ref다.**

**Files:**
- Create: `teacher-web/src/webrtc/useSession.ts`

**Interfaces:**
- Consumes: `DataMessage` (Task 2), `TeacherApi.getToken` (Task 3)
- Produces: `useSession({ signalingUrl, room, role, onData, enabled })` → `{ localRef, remoteRef, iceState, connected, send, hangUp }`. `enabled: false` 이면 카메라도 켜지 않고 소켓도 열지 않는다

- [ ] **Step 1: 훅 작성**

Create `teacher-web/src/webrtc/useSession.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DataMessage } from '../domain/types'

interface Options {
  signalingUrl: string
  room: string
  role: 'caller' | 'callee'
  onData: (msg: DataMessage) => void
  /** 접속 정보를 백엔드에서 받아오기 전에는 붙지 않는다. */
  enabled: boolean
}

const CAPTURE = { width: 480, height: 270, frameRate: 24 }

export function useSession({ signalingUrl, room, role, onData, enabled }: Options) {
  // 미디어 객체는 절대 state 에 넣지 않는다. 재렌더가 srcObject 를 흔들면 영상이 끊긴다.
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteSetRef = useRef(false)
  const pendingRef = useRef<RTCIceCandidate[]>([])
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  // 화면에 그리는 값만 state 다.
  const [iceState, setIceState] = useState<RTCIceConnectionState>('new')
  const [connected, setConnected] = useState(false)

  const send = useCallback((msg: DataMessage) => {
    const dc = dcRef.current
    if (dc?.readyState === 'open') dc.send(JSON.stringify(msg))
  }, [])

  const hangUp = useCallback(() => {
    wsRef.current?.close()
    dcRef.current?.close()
    pcRef.current?.close()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    wsRef.current = null
    dcRef.current = null
    pcRef.current = null
    localStreamRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    const turnUrl = import.meta.env.VITE_TURN_URL
    if (turnUrl) {
      iceServers.push({
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USER ?? '',
        credential: import.meta.env.VITE_TURN_PASS ?? '',
      })
    }

    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc

    const attachData = (dc: RTCDataChannel) => {
      dcRef.current = dc
      dc.onmessage = (e) => onDataRef.current(JSON.parse(e.data) as DataMessage)
    }

    if (role === 'caller') attachData(pc.createDataChannel('lesson'))
    else pc.ondatachannel = (e) => attachData(e.channel)

    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]
    }
    pc.oniceconnectionstatechange = () => {
      setIceState(pc.iceConnectionState)
      setConnected(pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')
    }

    const flush = async () => {
      remoteSetRef.current = true
      while (pendingRef.current.length) {
        const c = pendingRef.current.shift()!
        try { await pc.addIceCandidate(c) } catch { /* 거부된 후보는 무시한다 */ }
      }
    }

    void (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: CAPTURE, audio: true })
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
      localStreamRef.current = stream
      if (localRef.current) localRef.current.srcObject = stream
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))

      const ws = new WebSocket(`${signalingUrl}/?room=${encodeURIComponent(room)}`)
      wsRef.current = ws

      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        ws.send(JSON.stringify({
          type: 'candidate',
          candidate: e.candidate.candidate,
          sdpMid: e.candidate.sdpMid,
          sdpMLineIndex: e.candidate.sdpMLineIndex,
        }))
      }

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'ready' && role === 'caller') {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
        } else if (msg.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
          await flush()
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
          await flush()
        } else if (msg.type === 'candidate') {
          const c = new RTCIceCandidate({
            candidate: msg.candidate,
            sdpMid: msg.sdpMid,
            sdpMLineIndex: msg.sdpMLineIndex,
          })
          if (remoteSetRef.current) {
            try { await pc.addIceCandidate(c) } catch { /* 무시 */ }
          } else {
            pendingRef.current.push(c)
          }
        }
      }
    })()

    return () => { cancelled = true; hangUp() }
  }, [enabled, signalingUrl, room, role, hangUp])

  return { localRef, remoteRef, iceState, connected, send, hangUp }
}
```

- [ ] **Step 2: 타입 검사**

```bash
cd teacher-web && npm run build
```
Expected: `tsc --noEmit` 통과 후 빌드 성공.

`import.meta.env` 타입 오류가 나면 `teacher-web/src/vite-env.d.ts` 를 만들고 `/// <reference types="vite/client" />` 한 줄을 넣는다.

- [ ] **Step 3: 커밋**

```bash
git add teacher-web/src/webrtc teacher-web/src/vite-env.d.ts
git commit -m "feat(teacher-web): port the verified WebRTC session into a hook"
```

---

## Task 5: 수업 목록과 대기실

**Files:**
- Create: `teacher-web/src/screens/SessionList.tsx`
- Create: `teacher-web/src/screens/Lobby.tsx`
- Modify: `teacher-web/src/App.tsx`

**Interfaces:**
- Consumes: `StubApi` (Task 3), `maskPhone` (Task 2)
- Produces: `<SessionList onEnter />`, `<Lobby session onStart onBack />`

- [ ] **Step 1: 목록 화면**

Create `teacher-web/src/screens/SessionList.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { SessionSummary } from '../domain/types'

export function SessionList({ api, onEnter }: {
  api: TeacherApi
  onEnter: (s: SessionSummary) => void
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    void api.listSessions(new Date().toISOString().slice(0, 10)).then(setSessions)
  }, [api])

  return (
    <div style={{ padding: 24 }}>
      <h1>오늘 수업</h1>
      <table>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId}>
              <td>{s.scheduledAt.slice(11, 16)}</td>
              <td>{s.studentName}</td>
              <td>{s.bookTitle}</td>
              <td>
                {/* 시작 5분 전부터만 입장할 수 있다. 설계 §4.1 */}
                <button disabled={s.status !== 'LOBBY_OPEN'} onClick={() => onEnter(s)}>
                  입장
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 대기실 화면**

Create `teacher-web/src/screens/Lobby.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { Readiness, SessionSummary } from '../domain/types'
import { maskPhone } from '../domain/format'

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
          <button onClick={async () => {
            const r = await api.nudge(session.sessionId)
            // 도달 실패를 조용히 넘기지 않는다. 설계 §6.1
            setNudgeResult(r.delivered
              ? '알림을 보냈어요'
              : `알림이 전달되지 않았어요 — 연락처로 시도해 주세요${r.reason ? ` (${r.reason})` : ''}`)
          }}>
            알림 보내기
          </button>
          {nudgeResult && <span style={{ marginLeft: 12 }}>{nudgeResult}</span>}
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

      {/* 준비 실패여도 시작할 수 있다. 설계 §6.3 */}
      <p><button onClick={onStart}>수업 시작</button></p>
    </div>
  )
}
```

- [ ] **Step 3: 앱 라우팅**

Modify `teacher-web/src/App.tsx` — 전체를 교체:

```tsx
import { useMemo, useState } from 'react'
import { createStubApi } from './api/stub'
import { SessionList } from './screens/SessionList'
import { Lobby } from './screens/Lobby'
import { Lesson } from './screens/Lesson'
import type { SessionSummary } from './domain/types'

type View =
  | { name: 'list' }
  | { name: 'lobby'; session: SessionSummary }
  | { name: 'lesson'; session: SessionSummary }

export function App() {
  const api = useMemo(() => createStubApi(), [])
  const [view, setView] = useState<View>({ name: 'list' })

  if (view.name === 'list') {
    return <SessionList api={api} onEnter={(s) => setView({ name: 'lobby', session: s })} />
  }
  if (view.name === 'lobby') {
    return (
      <Lobby
        api={api}
        session={view.session}
        onStart={() => setView({ name: 'lesson', session: view.session })}
        onBack={() => setView({ name: 'list' })}
      />
    )
  }
  return (
    <Lesson
      api={api}
      session={view.session}
      onEnded={() => setView({ name: 'list' })}
    />
  )
}
```

- [ ] **Step 4: 타입 검사 — 남는 오류가 하나뿐인지 확인**

`Lesson` 은 Task 6에서 만들므로 이 시점에는 빌드가 통과하지 않는다. 그건 정상이다. 확인할 것은 **남는 오류가 그것 하나뿐**이라는 사실이다.

```bash
cd teacher-web && npm run build 2>&1 | grep -E "error TS" | head -20
```
Expected: `Cannot find module './screens/Lesson'` 계열 한 줄만. `SessionList` 나 `Lobby` 자체의 오류가 섞여 있으면 그것부터 고친다.

- [ ] **Step 5: 커밋**

```bash
git add teacher-web/src/screens teacher-web/src/App.tsx
git commit -m "feat(teacher-web): add the session list and lobby"
```

---

## Task 6: 수업 화면

**Files:**
- Create: `teacher-web/src/screens/Lesson.tsx`
- Create: `teacher-web/src/components/TopBar.tsx`
- Create: `teacher-web/src/components/BookViewer.tsx`

**Interfaces:**
- Consumes: `useSession` (Task 4), `applyPageSync`/`nextLocalPage`/`accumulateDisconnected`/`formatElapsed` (Task 2)
- Produces: `<Lesson api session onEnded />`

- [ ] **Step 1: 상단바**

Create `teacher-web/src/components/TopBar.tsx`:

```tsx
import { formatElapsed } from '../domain/format'
import type { PresenceState } from '../domain/types'

const BADGE: Record<Exclude<PresenceState, 'IN_CLASS'>, { icon: string; label: string }> = {
  PIP: { icon: '🟡', label: '다른 화면' },
  SCREEN_OFF: { icon: '🟠', label: '자리비움' },
  DISCONNECTED: { icon: '🔴', label: '연결 끊김' },
}

export function TopBar({ studentName, elapsedMs, presence, presenceMs, disconnectedMs, onEnd }: {
  studentName: string
  elapsedMs: number
  presence: PresenceState
  presenceMs: number
  disconnectedMs: number
  onEnd: () => void
}) {
  const badge = presence === 'IN_CLASS' ? null : BADGE[presence]
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #ddd' }}>
      <strong>{studentName}</strong>
      <span>경과 {formatElapsed(elapsedMs)}</span>
      {badge && <span>{badge.icon} {badge.label} {formatElapsed(presenceMs)}</span>}
      {/* 시간 보상이 선생님 재량이므로 근거를 항상 보여준다. 설계 §5.2 */}
      <span>끊김 {formatElapsed(disconnectedMs)}</span>
      <button style={{ marginLeft: 'auto' }} onClick={onEnd}>수업 종료</button>
    </div>
  )
}
```

- [ ] **Step 2: 학습화면 뷰어**

Create `teacher-web/src/components/BookViewer.tsx`:

```tsx
export function BookViewer({ pageNo, totalPages, lastBy, onPage, onPointer }: {
  pageNo: number
  totalPages: number
  lastBy: 'teacher' | 'student' | null
  onPage: (next: number) => void
  onPointer: (x: number, y: number, action: 'down' | 'move' | 'up') => void
}) {
  return (
    <div
      style={{ flex: '0 0 58%', position: 'relative', background: '#fafafa', borderRight: '1px solid #ddd' }}
      onPointerDown={(e) => onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'down')}
      onPointerMove={(e) => e.buttons === 1 && onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'move')}
      onPointerUp={(e) => onPointer(e.nativeEvent.offsetX, e.nativeEvent.offsetY, 'up')}
    >
      {/*
        책 지면은 자리표시다. 실제 학습 컨텐츠는 다른 팀이 만들고 있고,
        상위 설계 §9의 "학습 컨텐츠 슬롯"으로 교체된다.
        여기서 검증하는 것은 지면 자체가 아니라 페이지 동기화와 포인터다.
      */}
      <div style={{ height: 'calc(100% - 48px)', display: 'grid', placeItems: 'center' }}>
        책 지면 {pageNo}
      </div>
      <div style={{ height: 48, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => onPage(Math.max(1, pageNo - 1))}>◀</button>
        <span>{pageNo} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, pageNo + 1))}>▶</button>
      </div>
      {/* 조용히 동기화되면 "내가 넘긴 게 아닌데" 가 된다. 설계 §7.2 */}
      {lastBy && (
        <div style={{ position: 'absolute', top: 12, left: 12, background: '#000a', color: '#fff', padding: '4px 10px', borderRadius: 4 }}>
          {lastBy === 'teacher' ? '선생님이 넘겼어요' : '학생이 넘겼어요'}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 수업 화면**

Create `teacher-web/src/screens/Lesson.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TeacherApi } from '../api/client'
import type { DataMessage, PageState, PresenceState, SessionSummary } from '../domain/types'
import { applyPageSync, nextLocalPage } from '../domain/pageSync'
import { accumulateDisconnected } from '../domain/presence'
import { useSession } from '../webrtc/useSession'
import { TopBar } from '../components/TopBar'
import { BookViewer } from '../components/BookViewer'

const TOTAL_PAGES = 48

export function Lesson({ api, session, onEnded }: {
  api: TeacherApi
  session: SessionSummary
  onEnded: () => void
}) {
  const [page, setPage] = useState<PageState>({ pageNo: 1, counter: 0, by: 'teacher' })
  const [lastBy, setLastBy] = useState<'teacher' | 'student' | null>(null)
  const [presence, setPresence] = useState<PresenceState>('IN_CLASS')
  const [presenceSince, setPresenceSince] = useState(Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const [presenceMs, setPresenceMs] = useState(0)
  const [disconnectedMs, setDisconnectedMs] = useState(0)
  const [note, setNote] = useState('')

  const startedAt = useRef(Date.now())
  const noteRef = useRef('')
  noteRef.current = note

  const onData = useCallback((msg: DataMessage) => {
    if (msg.type === 'page_sync') {
      setPage((cur) => {
        const next = applyPageSync(cur, { pageNo: msg.pageNo, counter: msg.counter, by: msg.by })
        if (next !== cur) setLastBy(msg.by)
        return next
      })
    } else if (msg.type === 'presence') {
      setPresence(msg.state)
      setPresenceSince(Date.now())
    }
  }, [])

  // 접속 정보는 환경변수가 아니라 백엔드에서 받는다. 방 이름과 역할을 서버가 정해야
  // 나중에 편성 시스템이 붙어도 화면이 안 바뀐다.
  const [conn, setConn] = useState<{ signalingUrl: string; room: string; role: 'caller' | 'callee' } | null>(null)
  useEffect(() => {
    void api.getToken(session.sessionId).then(setConn)
  }, [api, session.sessionId])

  const { localRef, remoteRef, send } = useSession({
    signalingUrl: conn?.signalingUrl ?? '',
    room: conn?.room ?? '',
    role: conn?.role ?? 'caller',
    onData,
    enabled: conn !== null,
  })

  // 1초 틱 하나로 경과·이탈·누적 끊김을 모두 갱신한다.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt.current)
      setPresenceMs(Date.now() - presenceSince)
      setDisconnectedMs((prev) => accumulateDisconnected(prev, presence, 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [presence, presenceSince])

  // 토스트는 1.5초만 띄운다.
  useEffect(() => {
    if (!lastBy) return
    const id = setTimeout(() => setLastBy(null), 1500)
    return () => clearTimeout(id)
  }, [lastBy])

  const changePage = (pageNo: number) => {
    setPage((cur) => {
      const next = nextLocalPage(cur, pageNo)
      send({ type: 'page_sync', pageNo: next.pageNo, counter: next.counter, by: 'teacher' })
      return next
    })
    setLastBy('teacher')
  }

  const end = async () => {
    await api.endSession(session.sessionId, noteRef.current, Math.round(disconnectedMs / 1000))
    onEnded()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        studentName={session.studentName}
        elapsedMs={elapsedMs}
        presence={presence}
        presenceMs={presenceMs}
        disconnectedMs={disconnectedMs}
        onEnd={end}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <BookViewer
          pageNo={page.pageNo}
          totalPages={TOTAL_PAGES}
          lastBy={lastBy}
          onPage={changePage}
          onPointer={(x, y, action) => send({ type: 'pointer', x, y, action })}
        />
        <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column' }}>
          {/* 아이 영상을 크게. 표정을 읽는 것이 선생님의 일이다. 설계 §3.1 */}
          <video ref={remoteRef} autoPlay playsInline style={{ flex: 2, background: '#000', minHeight: 0 }} />
          <video ref={localRef} autoPlay playsInline muted style={{ flex: 1, background: '#000', minHeight: 0 }} />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모"
            style={{ height: 120, resize: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 전체 타입 검사와 테스트**

```bash
cd teacher-web && npm run build && npm test
```
Expected: 빌드 성공, 19 passed.

- [ ] **Step 5: 브라우저에서 확인**

```bash
cd signaling && npm start
```
다른 터미널에서:
```bash
cd teacher-web && npm run dev
```

브라우저 창 2개를 연다:
1. `http://localhost:5173` — 선생님 화면. [입장] → [수업 시작]
2. `http://localhost:8080/teacher.html?room=s1&role=callee` — Phase 0 페이지가 상대 피어

Expected: 양쪽에 상대 영상이 뜬다. 선생님 화면 상단에 경과 시간이 흐른다. ◀▶ 로 페이지를 넘기면 "선생님이 넘겼어요" 토스트가 뜬다.

> Phase 0 페이지에는 DataChannel 수신이 없으므로 페이지 동기화의 **왕복**은 아이 앱이 붙어야 확인된다. 여기서 확인하는 것은 영상 연결과 선생님측 발신까지다.

- [ ] **Step 6: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): add the lesson screen with presence, sync and notes"
```

---

## Task 7: 메모 자동저장과 재입장

**Files:**
- Modify: `teacher-web/src/screens/Lesson.tsx`
- Modify: `teacher-web/src/api/client.ts`, `teacher-web/src/api/stub.ts`
- Create: `teacher-web/src/domain/autosave.ts` + `autosave.test.ts`

**Interfaces:**
- Consumes: `Lesson` (Task 6)
- Produces: `TeacherApi.saveNote(sessionId, note)`, `debounce(fn, ms)`

- [ ] **Step 1: debounce 테스트 작성**

Create `teacher-web/src/domain/autosave.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { debounce } from './autosave'

describe('debounce', () => {
  it('마지막 호출만 실행한다', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('a'); d('b'); d('c')
    vi.advanceTimersByTime(2999)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledExactlyOnceWith('c')
    vi.useRealTimers()
  })

  it('flush 하면 즉시 실행한다 — 종료 시 저장을 놓치면 안 된다', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const d = debounce(fn, 3000)
    d('x')
    d.flush()
    expect(fn).toHaveBeenCalledExactlyOnceWith('x')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './autosave'`

Create `teacher-web/src/domain/autosave.ts`:

```typescript
export interface Debounced<A extends unknown[]> {
  (...args: A): void
  flush(): void
}

/**
 * 메모 자동저장용. 설계 §8.
 * flush 가 있는 이유는 종료 버튼을 누른 순간 아직 안 나간 저장이 남아 있을 수 있어서다.
 * 연속 수업에서 마지막 몇 글자가 사라지면 선생님이 다시 적을 방법이 없다.
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let last: A | null = null

  const wrapped = ((...args: A) => {
    last = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; if (last) fn(...last) }, ms)
  }) as Debounced<A>

  wrapped.flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (last) fn(...last)
  }

  return wrapped
}
```

```bash
npm test
```
Expected: PASS — 21 passed

- [ ] **Step 3: API 에 저장 추가**

Modify `teacher-web/src/api/client.ts` — `TeacherApi` 에 추가:

```typescript
  /** 메모 중간 저장. 종료 전에 잃지 않기 위한 것이다. */
  saveNote(sessionId: string, note: string): Promise<void>
```

Modify `teacher-web/src/api/stub.ts` — `StubApi` 에 `lastNote` 를 추가하고 구현:

```typescript
    async saveNote(sessionId, note) {
      api.lastNote = { sessionId, note }
    },
```

`StubApi` 인터페이스에 `lastNote: { sessionId: string; note: string } | null` 을 추가하고 초기값 `null` 을 넣는다.

- [ ] **Step 4: 수업 화면에 붙이기**

Modify `teacher-web/src/screens/Lesson.tsx`:

import 에 추가:
```typescript
import { debounce } from '../domain/autosave'
```

컴포넌트 안에 추가:
```tsx
  const saveNote = useRef(
    debounce((text: string) => { void api.saveNote(session.sessionId, text) }, 3000),
  ).current
```

`textarea` 의 `onChange` 를 교체:
```tsx
            onChange={(e) => { setNote(e.target.value); saveNote(e.target.value) }}
```

`end` 함수 맨 앞에 추가 — 아직 안 나간 저장을 흘려보낸다:
```tsx
    saveNote.flush()
```

- [ ] **Step 5: 재입장 지원**

설계 §4.3은 종료 확인 다이얼로그를 없앤 대가로 재입장을 요건으로 만들었다.

Modify `teacher-web/src/screens/SessionList.tsx` — `disabled` 조건을 교체한다. 종료된 수업도 예정 시각 +30분 안이면 다시 들어갈 수 있다:

```tsx
                <button
                  disabled={!canEnter(s)}
                  onClick={() => onEnter(s)}
                >
                  {s.status === 'ENDED' ? '다시 입장' : '입장'}
                </button>
```

같은 파일 상단에 추가:

```tsx
/** 설계 §4.3 — 종료해도 예정 시각 +30분 안이면 다시 들어갈 수 있다. */
function canEnter(s: SessionSummary): boolean {
  if (s.status === 'LOBBY_OPEN' || s.status === 'IN_PROGRESS') return true
  if (s.status !== 'ENDED') return false
  const limit = new Date(s.scheduledAt).getTime() + 30 * 60 * 1000
  return Date.now() < limit
}
```

- [ ] **Step 6: 전체 검사**

```bash
cd teacher-web && npm run build && npm test
```
Expected: 빌드 성공, 21 passed.

- [ ] **Step 7: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): autosave notes and allow re-entry within 30 minutes"
```

---

## 부록 — 이 계획이 하지 않는 것

| 항목 | 담당 |
|---|---|
| 수업 편성·배정·취소·노쇼 | 별도 스펙 A (설계 §1.1) |
| 선생님 인증 | 오픈이슈 #3 |
| 실제 백엔드 — 지금은 전부 스텁 | 백엔드 팀 |
| FCM 발송 서버측 구현 | 인프라. 화면은 `nudge` 결과만 소비한다 |
| 아이 앱과의 DataChannel 왕복 검증 | 아이 앱이 Phase 2에 DataChannel 을 갖춘 뒤 |
| 촬영 중 뷰파인더 전환 (설계 §7.4) | 아이 앱의 Camera Arbiter (Phase 4) 이후 |
| 디자인 시스템·시각 다듬기 | 인라인 스타일로 두었다. 별도 |

인라인 스타일을 쓴 것은 의도다. 이 단계의 목표는 **동작하는 화면**이고, 디자인 토큰·컴포넌트 라이브러리 선택은 화면이 확정된 뒤에 하는 편이 낫다.
