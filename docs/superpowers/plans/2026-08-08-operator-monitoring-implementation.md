# 운영자 모니터링 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수업이 실제로 시작되고 살아 있다는 것을 서버가 알게 하고, 그 위에 운영자가 볼 집계 API와 화면을 얹는다. 부수적으로, 정의만 되어 있던 "선생님 연결 소실 90초 후 자동 종료" 안전장치가 처음으로 동작하게 된다.

**Architecture:** 기존 `scheduling` 백엔드에 시작·생존신호 엔드포인트와 정리 배치를 더하고, 운영자 전용 집계 라우트를 붙인다. 화면은 새 `admin-web` (React + Vite)이며 `teacher-web` 과 같은 스택을 쓴다. 판단 로직은 순수 함수로 분리해 DB 없이 테스트로 먼저 고정한다.

**Tech Stack:** 기존 그대로 — Node 22 · TypeScript 7.0.2 · Fastify 5.11.2 · Prisma 7.9.1 · React 19.2.8 · Vite 8.2.1 · Vitest 4.1.10

**설계 문서:** `docs/superpowers/specs/2026-08-08-operator-monitoring-design.md` (이하 "설계"). 상위: `2026-08-06-studymeet-video-tutoring-design.md` (이하 "본 설계").

---

## ⚠️ 인증이 없는 상태로 만든다

설계 §2에 따라 **인증은 이 계획 뒤로 미뤄졌다.** 운영자 화면은 전체 아동의 보호자 연락처를 보므로, 인증 없이 접근 가능한 곳에 띄우면 URL을 아는 누구에게나 그 정보가 열린다.

따라서 이 계획은 **대체 안전장치 둘을 반드시 포함한다** (설계 §2.1):

1. **운영자 API 서버는 `127.0.0.1` 에만 바인딩한다.**
2. **운영자 전용 엔드포인트는 공유 시크릿 헤더를 요구한다.** 값은 `.env` 에 두고 커밋하지 않는다.

이것은 인증이 아니다 — 시크릿을 아는 모두가 같은 권한을 갖고 감사 기록도 없다. **실수로 노출되는 것만 막는 장치**다.

**운영 환경 배포는 설계 §5의 인증이 완료된 뒤에만 한다.**

---

## Global Constraints

- **선생님용 7+3 엔드포인트의 시그니처를 바꾸지 않는다.** `teacher-web` 이 이미 쓰고 있고 브라우저로 검증되었다.
- 저장은 UTC, 경계 판정(오늘, 슬롯, 하루 전)은 **KST**. 이 프로젝트는 이미 이것을 섞어 한 번 다쳤다 — 수업 시각이 9시간 어긋나 표시됐다.
- **운영자 라우트는 반드시 시크릿 헤더 검사를 통과해야 한다.** 하나라도 빠지면 그 하나가 구멍이다.
- 실시간 요약은 **집계 숫자만** 보낸다. 세션 목록을 실시간으로 밀지 않는다 — 그러면 SSE와 팬아웃 설계가 필요해진다.
- 생존신호 주기 30초, 끊김 판정 90초. 본 설계 §4.5의 값과 맞춘다.
- TypeScript 7.0.2, `noUnusedLocals`/`noUnusedParameters`. **의존성을 추가하지 않는다** (`admin-web` 의 초기 구성 제외).
- `.env` 는 gitignore. 시크릿을 커밋하거나 출력하지 않는다.

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Task 1 (순수 로직) | Node 만 |
| Task 2–4 | Postgres 컨테이너 `studymeet-pg` |
| Task 5–6 | 위 + 브라우저 |

---

## File Structure

| 경로 | 책임 | 상태 |
|---|---|---|
| `scheduling/prisma/schema.prisma` | `startedAt`, `lastHeartbeatAt` 컬럼 추가 | 수정 |
| `scheduling/src/domain/liveness.ts` + 테스트 | 생존신호 판정, 집계 분류. 순수 함수 | 신규 |
| `scheduling/src/routes/session.ts` | `start`, `heartbeat` 추가 | 수정 |
| `scheduling/src/routes/operator.ts` | 집계·목록·검색 | 신규 |
| `scheduling/src/middleware/operatorOnly.ts` | 시크릿 헤더 검사 | 신규 |
| `scheduling/src/jobs/reapStale.ts` + 테스트 | 90초 넘긴 세션 정리 | 신규 |
| `scheduling/src/server.ts` | 라우트 등록, 바인딩 주소 | 수정 |
| `teacher-web/src/api/*` | `startSession`, `heartbeat` 추가 | 수정 |
| `teacher-web/src/screens/Lesson.tsx` | 시작 알림 + 30초 생존신호 | 수정 |
| `admin-web/` | 새 앱 | 신규 |

---

## Task 1: 생존신호 판정과 집계 분류 (TDD)

**Files:** `scheduling/src/domain/liveness.ts` + `liveness.test.ts`

**Interfaces:** Produces `isStale()`, `STALE_AFTER_MS`, `HEARTBEAT_INTERVAL_MS`

- [ ] **Step 1: 실패 테스트**

Create `scheduling/src/domain/liveness.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { HEARTBEAT_INTERVAL_MS, isStale, STALE_AFTER_MS } from './liveness'

const now = new Date('2026-08-08T19:05:00+09:00')

describe('isStale', () => {
  it('방금 신호가 왔으면 살아 있다', () => {
    expect(isStale(new Date('2026-08-08T19:04:50+09:00'), now)).toBe(false)
  })

  it('89초는 아직 살아 있다 — 한 번쯤 놓칠 수 있다', () => {
    expect(isStale(new Date('2026-08-08T19:03:31+09:00'), now)).toBe(false)
  })

  it('90초를 넘기면 방치로 본다', () => {
    expect(isStale(new Date('2026-08-08T19:03:30+09:00'), now)).toBe(true)
  })

  it('신호가 한 번도 없었으면 판정하지 않는다 — 시작 직후일 수 있다', () => {
    expect(isStale(null, now)).toBe(false)
  })
})

describe('상수', () => {
  it('끊김 판정은 주기의 3배다 — 두 번까지는 놓쳐도 살려 둔다', () => {
    expect(STALE_AFTER_MS).toBe(HEARTBEAT_INTERVAL_MS * 3)
  })

  it('본 설계 §4.5 의 90초와 맞는다', () => {
    expect(STALE_AFTER_MS).toBe(90_000)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
cd scheduling && npm test
```
Expected: FAIL — `Cannot find module './liveness'`

- [ ] **Step 3: 구현**

Create `scheduling/src/domain/liveness.ts`:

```typescript
/** 설계 §3.2 — 선생님 브라우저가 30초마다 신호를 보낸다. */
export const HEARTBEAT_INTERVAL_MS = 30_000

/**
 * 본 설계 §4.5 의 "선생님 연결 소실 90초 후 자동 종료".
 * 주기의 3배로 두는 것은 의도다 — 신호 두 번을 놓쳐도 수업을 끊지 않는다.
 * 진행 중인 수업을 잘못 끊는 쪽이 방치된 방을 조금 늦게 치우는 것보다 나쁘다.
 */
export const STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3

/**
 * 신호가 한 번도 없으면 방치로 보지 않는다.
 * 시작 직후 첫 신호 전일 수 있고, 그때 끊으면 막 시작한 수업을 죽인다.
 */
export function isStale(lastHeartbeatAt: Date | null, now: Date): boolean {
  if (lastHeartbeatAt === null) return false
  return now.getTime() - lastHeartbeatAt.getTime() >= STALE_AFTER_MS
}
```

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
npm test
git add scheduling/src/domain
git commit -m "feat(scheduling): add liveness rules with tests"
```

---

## Task 2: 스키마와 시작·생존신호 엔드포인트

**Files:** `scheduling/prisma/schema.prisma`, `scheduling/src/routes/session.ts`

**Interfaces:** Produces `POST /sessions/:id/start`, `POST /sessions/:id/heartbeat`

- [ ] **Step 1: 컬럼 추가**

Modify `scheduling/prisma/schema.prisma` — `Session` 모델에 두 줄을 더한다. 다른 `DateTime` 필드와 같이 `@db.Timestamptz(3)` 를 붙인다:

```prisma
  startedAt       DateTime?     @db.Timestamptz(3)
  lastHeartbeatAt DateTime?     @db.Timestamptz(3)
```

```bash
cd scheduling && npm run db:push && npm run db:generate
docker exec studymeet-pg psql -U studymeet -d studymeet -c '\d "Session"'
```
Expected: 두 컬럼이 `timestamp with time zone` 으로 보인다.

- [ ] **Step 2: 엔드포인트 추가**

Modify `scheduling/src/routes/session.ts` — 기존 라우트들과 같은 방식(zod 검증, 명확한 상태코드)으로 둘을 더한다.

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/sessions/:id/start` | 상태가 `SCHEDULED` 나 `LOBBY_OPEN` 일 때만. `IN_PROGRESS` 로 바꾸고 `startedAt`, `lastHeartbeatAt` 을 지금으로. 그 외 상태면 409. **조건부 `updateMany` 하나로 처리한다** — 읽고 쓰면 이중 클릭에 `startedAt` 이 덮인다 |

⚠️ **`IN_PROGRESS` 를 새로 쓰기 시작하면 기존 종료 경로가 막힌다.** `/end` 와 `/cancel` 의 가드는 `IN_PROGRESS` 가 존재하지 않던 때 쓰여서 `SCHEDULED` 만 받는다. 그대로 두면 **선생님이 정상적으로 끝낸 수업이 409로 거부되고**, 결국 리퍼가 "생존신호 끊김" 으로 잘못 기록한다. `/end` 는 `IN_PROGRESS` 를, `/cancel` 은 `LOBBY_OPEN` 과 `IN_PROGRESS` 를 함께 받도록 **같은 태스크에서 넓힌다.**
| POST | `/sessions/:id/heartbeat` | `IN_PROGRESS` 일 때만 `lastHeartbeatAt` 갱신. 그 외 상태면 409 |

`heartbeat` 는 **초당 100회 들어온다.** 세션을 읽고 쓰는 왕복을 두 번 하지 말고, 상태 조건을 건 단일 `updateMany` 로 처리하고 영향 행 수로 결과를 판단한다.

- [ ] **Step 3: 실제 호출로 확인**

세션 하나를 시드하고:

```bash
curl -sX POST localhost:3000/sessions/<id>/start
curl -sX POST localhost:3000/sessions/<id>/heartbeat
curl -sX POST localhost:3000/sessions/<id>/start
```
Expected: 순서대로 성공, 성공, **409**. 그리고 DB에서 `status='IN_PROGRESS'`, `startedAt` 과 `lastHeartbeatAt` 이 채워져 있다.

- [ ] **Step 4: 커밋**

```bash
git add scheduling/prisma scheduling/src
git commit -m "feat(scheduling): record when a lesson starts and that it is alive"
```

---

## Task 3: 방치된 세션 정리 배치

본 설계 §4.5가 정의만 해두고 구현 경로가 없던 안전장치다.

**Files:** `scheduling/src/jobs/reapStale.ts` + 테스트

**Interfaces:** Consumes `isStale` (Task 1). Produces `reapStale(prisma, now)`

- [ ] **Step 1: 실패 테스트**

DB 없이 검증할 수 있는 것은 "어떤 세션을 고르는가" 뿐이다. 그것만 순수 함수로 떼어 테스트한다.

Create `scheduling/src/jobs/reapStale.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { pickStale } from './reapStale'

const now = new Date('2026-08-08T19:05:00+09:00')
const s = (id: string, lastHeartbeatAt: Date | null) => ({ id, lastHeartbeatAt })

describe('pickStale', () => {
  it('90초를 넘긴 것만 고른다', () => {
    const picked = pickStale([
      s('a', new Date('2026-08-08T19:04:50+09:00')),
      s('b', new Date('2026-08-08T19:03:00+09:00')),
    ], now)
    expect(picked).toEqual(['b'])
  })

  it('신호가 없는 세션은 건드리지 않는다 — 막 시작했을 수 있다', () => {
    expect(pickStale([s('a', null)], now)).toEqual([])
  })

  it('고를 것이 없으면 빈 배열이다', () => {
    expect(pickStale([], now)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './reapStale'`

Create `scheduling/src/jobs/reapStale.ts` 에 `pickStale` 순수 함수와, 그것을 쓰는 `reapStale(prisma, now)` 를 함께 둔다.

`reapStale` 은 `IN_PROGRESS` 세션을 가져와 `pickStale` 로 거르고, 고른 것을 `ENDED` 로 바꾼다.

⚠️ **쓰기는 반드시 읽은 조건을 다시 걸어야 한다.** `where: { id }` 만으로 쓰면, 스냅샷을 찍은 뒤 진짜 생존신호가 도착한 세션까지 끊는다 — 쓰는 순간 살아 있음이 증명된 수업을 죽이는 것이고, `/start` 가 `ENDED` 를 받지 않으므로 되돌릴 길이 없다. `updateMany` 에 `status: 'IN_PROGRESS'` 와 `lastHeartbeatAt: { lt: cutoff }` 를 함께 걸고 영향 행 수로 판단한다.

**크레딧을 발급하지 않는다.** 이것은 결석이 아니라 선생님 브라우저가 죽은 것이고, 수업은 실제로 진행되었을 수 있다. 크레딧 판단은 사람이 한다 — 편성 설계 §5.1의 발생 사유 목록에 "생존신호 끊김" 이 없는 것은 의도다.

정리된 세션에 그 사실이 남도록 **`Session.endedReason` 필드를 따로 둔다.** `note` 에 넣으면 안 된다 — `PUT /sessions/:id/note` 가 상태 가드 없이 통째로 덮어써서, 선생님이 메모를 한 번 고치는 순간 자동 종료 사유가 사라진다.

- [ ] **Step 3: 통과 확인 후 커밋**

```bash
npm test
git add scheduling/src/jobs
git commit -m "feat(scheduling): close sessions whose teacher stopped reporting"
```

---

## Task 4: 운영자 집계 API

**Files:** `scheduling/src/middleware/operatorOnly.ts`, `scheduling/src/routes/operator.ts`, `scheduling/src/server.ts`

**Interfaces:** Produces 5개 조회 엔드포인트

- [ ] **Step 1: 시크릿 헤더 검사**

Create `scheduling/src/middleware/operatorOnly.ts`.

`X-Operator-Secret` 헤더가 `process.env.OPERATOR_SECRET` 과 같지 않으면 **404** 를 돌려준다. 401이 아니라 404인 것은 의도다 — 엔드포인트의 존재 자체를 알리지 않는다.

`OPERATOR_SECRET` 이 설정되지 않았으면 **서버를 시작하지 않는다.** 빈 값으로 조용히 통과시키면 안전장치가 없는 채로 뜬다.

파일 상단에 이것이 인증이 아니라는 사실과 설계 §2.1을 주석으로 남긴다.

- [ ] **Step 2: 바인딩 주소**

Modify `scheduling/src/server.ts` — `listen` 의 host 를 환경변수에서 읽되 **기본값을 `127.0.0.1`** 로 한다. 외부 인터페이스에 여는 것은 명시적 선택이어야 한다.

- [ ] **Step 3: 집계 라우트**

Create `scheduling/src/routes/operator.ts`. 전부 `operatorOnly` 를 거친다.

| 경로 | 내용 |
|---|---|
| `GET /operator/live` | 설계 §4.1 — `{ inProgress, disconnected, notReady, stale }` 숫자 넷 |
| `GET /operator/today?date=` | 설계 §4.2 — 상태별 건수 |
| `GET /operator/not-ready?date=` | 설계 §4.3 — 학생·담임·시각·실패 항목 |
| `GET /operator/credit-warnings` | 설계 §4.4 — `warn` 인 등록 |
| `GET /operator/sessions?q=&date=` | 설계 §4.5 — 학생명·선생님명 검색 |

`/operator/live` 는 10초마다 불린다. **목록을 세지 말고 `count` 질의를 쓴다.**

`stale` 은 `IN_PROGRESS` 이면서 `lastHeartbeatAt` 이 90초를 넘긴 것이다 — Task 1의 상수를 쓰고 숫자를 다시 적지 않는다.

**연락처는 이 API로 내보내지 않는다.** 준비 실패 목록에도 마스킹된 값조차 넣지 않는다. 필요해지면 선생님 화면과 같은 열람 기록 경로를 따로 만든다.

- [ ] **Step 4: 실제 호출로 확인**

```bash
curl -si localhost:3000/operator/live | head -1
curl -si -H "X-Operator-Secret: <값>" localhost:3000/operator/live | head -1
```
Expected: 첫 번째 **404**, 두 번째 **200**. 다섯 경로 모두 헤더 없이 404인 것을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add scheduling/src
git commit -m "feat(scheduling): add operator aggregate endpoints behind a shared secret"
```

---

## Task 5: 선생님 화면이 시작과 생존신호를 보낸다

**Files:** `teacher-web/src/api/{client,stub,http}.ts`, `teacher-web/src/screens/Lesson.tsx`

**Interfaces:** Consumes Task 2. Produces `startSession()`, `heartbeat()`

- [ ] **Step 1: API 계층**

기존 방식대로 `TeacherApi` 에 둘을 더하고 스텁과 HTTP 양쪽에 구현한다. **기존 메서드 시그니처는 건드리지 않는다.**

- [ ] **Step 2: 수업 화면에 배선**

Modify `teacher-web/src/screens/Lesson.tsx`:

- 마운트 직후, 접속 정보를 받은 뒤 `startSession` 을 한 번 부른다.
- 30초 간격으로 `heartbeat` 를 보낸다. `HEARTBEAT_INTERVAL_MS` 와 같은 값을 쓰되 프론트에 상수로 둔다.
- 언마운트 시 인터벌을 정리한다.
- **생존신호 실패를 화면에 띄우지 않는다.** 선생님이 할 수 있는 일이 없고, 수업 중에 뜨는 오류 배너는 방해만 된다. 콘솔 경고로 충분하다.
- 이미 있는 1초 틱과 합치지 않는다. 목적이 다르고 주기가 다르다.

**주의**: 이 화면은 미디어 객체를 state 에 넣지 않는다는 제약이 있다. 인터벌 ID 는 `useRef` 에 둔다.

- [ ] **Step 3: 확인**

```bash
cd teacher-web && npm run build && npm test
```
Expected: 빌드 클린, 35 passed.

- [ ] **Step 4: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): report lesson start and keep reporting alive"
```

---

## Task 6: admin-web

**Files:** `admin-web/` 전체

**Interfaces:** Consumes Task 4의 5개 엔드포인트

- [ ] **Step 1: 프로젝트 골격**

`teacher-web/package.json` 과 같은 버전을 그대로 쓴다. `@testing-library/react` 와 `jsdom` 은 화면 테스트를 쓰지 않으면 뺀다.

`.env.example` 에 `VITE_API_BASE` 와 `VITE_OPERATOR_SECRET` 을 둔다. `.env.local` 은 gitignore 한다.

> **시크릿이 브라우저 번들에 들어간다.** `VITE_` 접두사가 붙은 값은 빌드 결과물에 그대로 박힌다. 이것이 §2.1의 장치가 인증이 아닌 이유이며, 그래서 localhost 바인딩이 함께 필요하다. 이 사실을 `admin-web/README.md` 에 적는다.

- [ ] **Step 2: 화면**

한 페이지에 설계 §4의 다섯 가지를 세로로 쌓는다. 라우터를 쓰지 않는다.

- 상단에 실시간 요약. **10초 폴링.** 탭이 백그라운드일 때는 멈춘다(`document.visibilityState`) — 아무도 안 보는 화면이 10초마다 서버를 두드릴 이유가 없다.
- 그 아래 오늘 집계, 준비 실패 목록, 크레딧 경고 목록, 세션 검색.
- 인라인 스타일. `teacher-web` 과 같은 결.

- [ ] **Step 3: 실 백엔드로 확인**

Postgres 를 띄우고 세션 몇 개를 시드한다. 하나는 `start` 를 불러 `IN_PROGRESS` 로, 하나는 `lastHeartbeatAt` 을 2분 전으로 두어 stale 로 만든다.

브라우저로 확인한다:

1. 실시간 요약의 `inProgress` 와 `stale` 이 시드한 대로 나온다
2. 시크릿을 틀리게 하면 화면이 데이터 없음이 아니라 **명확한 오류**를 보여준다
3. 준비 실패 목록과 크레딧 경고 목록이 나온다
4. 세션 검색이 학생명으로 동작한다
5. 탭을 백그라운드로 두면 폴링이 멈춘다 (네트워크 탭으로 확인)

`reapStale` 을 한 번 돌려 stale 세션이 `ENDED` 가 되고 **크레딧이 발급되지 않았음**을 확인한다:

```sql
SELECT e.id, e."creditBalance", COALESCE(SUM(c.delta), 0) AS ledger
FROM "Enrollment" e LEFT JOIN "CreditEntry" c ON c."enrollmentId" = e.id
GROUP BY e.id, e."creditBalance";
```
Expected: 정리 전후로 값이 같다.

시드한 행과 임시 스크립트는 지운다.

- [ ] **Step 4: 커밋**

```bash
git add admin-web .gitignore
git commit -m "feat(admin-web): add the operator monitoring page"
```

---

## 부록 — 이 계획이 하지 않는 것

| 항목 | 담당 |
|---|---|
| **인증** | 설계 §5. 이 계획 다음 |
| 학생·선생님 등록, 담임 배정, 시간표 편집 | 범위 밖 (설계 §1) |
| 크레딧 수동 조정 | 범위 밖 |
| 연락처 열람 | 운영자 API 는 연락처를 내보내지 않는다 |
| 접근 로그 | 인증과 함께 |
| 배치 스케줄러 | `reapStale` 은 함수로만 둔다. 주기 실행은 운영 배포 시 |
| 알림·경보 | 화면에서 보는 것까지 |

**운영 환경 배포는 인증이 완료된 뒤에만 한다** (설계 §2.1).
