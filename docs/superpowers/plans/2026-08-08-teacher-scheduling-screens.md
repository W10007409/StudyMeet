# 선생님용 편성 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님이 자기 수업을 휴강하고, 담당 학생의 잔여 보강 크레딧을 보고, 자기 빈 슬롯에 보강 수업을 직접 잡을 수 있게 한다.

**Architecture:** 이미 있는 `teacher-web` React 앱에 화면 셋을 더한다. 백엔드 엔드포인트 셋(`cancel`, `makeup-slots`, `makeups`)은 이미 구현되어 실 DB로 검증되었다. 새 프로젝트도, 새 의존성도 없다. 판단 로직(어떤 수업을 휴강할 수 있는지, 크레딧이 있는지, 슬롯이 비었는지)은 순수 함수로 분리해 테스트로 먼저 고정한다.

**Tech Stack:** 기존 그대로 — React 19.2.8 · TypeScript 7.0.2 · Vite 8.2.1 · Vitest 4.1.10

**설계 문서:** `docs/superpowers/specs/2026-08-07-lesson-scheduling-design.md` §6.1 (이하 "편성 설계"), `2026-08-07-teacher-lesson-screen-design.md` (이하 "화면 설계").

---

## 이 계획이 메우는 구멍

편성 설계 §6.1은 선생님용 화면 **넷**을 정의한다. 현재 상태:

| 화면 | 상태 |
|---|---|
| 내 일정 | ✅ `SessionList` 가 겸한다 |
| **휴강 신청** | ❌ 없음 |
| **보강 예약** | ❌ 없음 |
| **담당 학생 + 잔여 크레딧** | ❌ 없음 |

`teacher-web` 계획은 수업 진행 화면만, 편성 백엔드 계획은 서버만 다뤘다. 그 사이가 비어 있었고 이 계획이 그 자리다.

---

## Global Constraints

- **`TeacherApi` 인터페이스에 메서드를 더하되, 기존 7개의 시그니처는 건드리지 않는다.** 수업 화면이 그대로 쓰고 있다.
- **시스템이 밀지 않고 선생님이 당긴다** (화면 설계 §2). 자동 보강 배정, 자동 휴강, 추천 슬롯 없음. 모든 행동은 선생님의 클릭에서 시작한다.
- **크레딧이 없으면 보강을 잡을 수 없다.** 화면이 먼저 막되, 진짜 방어는 서버의 트랜잭션이다. 화면의 검사는 편의이지 보증이 아니다.
- **빈 슬롯 표시는 낙관적이다.** 두 선생님이 같은 순간 같은 슬롯을 볼 수 있고, 서버가 `@@unique([teacherId, scheduledAt])` 위반으로 409를 준다. **409를 반드시 사람이 읽을 수 있는 메시지로 보여준다.** 조용히 실패하면 선생님은 잡혔다고 믿는다.
- **휴강 마감을 넘겨도 요청은 거부되지 않는다.** 서버가 `NO_SHOW` 로 기록하고 크레딧은 동일하게 발급한다(편성 설계 §4.2). 화면은 그 차이를 **미리 알려주되 막지 않는다.**
- 시각은 전부 **KST**. 백엔드가 `+09:00` 오프셋 ISO 문자열로 주므로 `slice(11, 16)` 로 시각을 읽는 기존 관행을 그대로 쓴다. `new Date().toISOString()` 으로 날짜를 만들면 UTC 로 밀린다.
- PC 브라우저, 최소 1280px. 반응형 없음. 인라인 스타일 유지 — 디자인 시스템은 아직 도입하지 않는다.
- TypeScript 7.0.2, `noUnusedLocals`/`noUnusedParameters`. **의존성을 추가하지 않는다.**

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Task 1 (순수 로직) | Node 만 |
| Task 2–5 | Postgres 컨테이너 `studymeet-pg` + `scheduling` 서버 + `teacher-web` dev 서버 |

---

## File Structure

| 경로 | 책임 | 상태 |
|---|---|---|
| `teacher-web/src/domain/scheduling.ts` + 테스트 | 휴강 가능 여부, 크레딧 보유, KST 날짜 계산. 순수 함수 | 신규 |
| `teacher-web/src/api/client.ts` | `TeacherApi` 에 3개 메서드 추가 | 수정 |
| `teacher-web/src/api/stub.ts` | 스텁 구현 추가 | 수정 |
| `teacher-web/src/api/http.ts` | 실제 호출 추가 | 수정 |
| `teacher-web/src/screens/MyStudents.tsx` | 담당 학생 + 잔여 크레딧 | 신규 |
| `teacher-web/src/screens/MakeupBooking.tsx` | 빈 슬롯 그리드 + 보강 예약 | 신규 |
| `teacher-web/src/screens/SessionList.tsx` | 각 행에 [휴강] 추가, 화면 이동 | 수정 |
| `teacher-web/src/App.tsx` | 두 화면 라우팅 추가 | 수정 |

---

## Task 1: 순수 판단 로직 (TDD)

**Files:** `teacher-web/src/domain/scheduling.ts` + `scheduling.test.ts`

**Interfaces:**
- Consumes: `SessionSummary` (기존 `domain/types.ts`)
- Produces: `canRequestCancel()`, `isLateCancel()`, `kstToday()`, `kstDatePlus()`

- [ ] **Step 1: 실패 테스트 작성**

Create `teacher-web/src/domain/scheduling.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { canRequestCancel, isLateCancel, kstDatePlus, kstToday } from './scheduling'
import type { SessionSummary } from './types'

const session = (status: SessionSummary['status'], scheduledAt: string): SessionSummary => ({
  sessionId: 's1',
  studentName: '김민준',
  studentId: 'stu-1',
  scheduledAt,
  durationMin: 10,
  bookTitle: '마당을 나온 암탉',
  status,
})

const at = '2026-08-10T19:00:00+09:00'

describe('canRequestCancel', () => {
  it('아직 안 한 수업만 휴강할 수 있다', () => {
    expect(canRequestCancel(session('SCHEDULED', at))).toBe(true)
    expect(canRequestCancel(session('LOBBY_OPEN', at))).toBe(true)
  })

  it('이미 끝났거나 취소된 수업은 휴강할 수 없다', () => {
    expect(canRequestCancel(session('ENDED', at))).toBe(false)
    expect(canRequestCancel(session('CANCELLED', at))).toBe(false)
    expect(canRequestCancel(session('NO_SHOW', at))).toBe(false)
    expect(canRequestCancel(session('IN_PROGRESS', at))).toBe(false)
  })
})

describe('isLateCancel', () => {
  it('24시간 넘게 남았으면 늦지 않았다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T10:00:00+09:00'))).toBe(false)
  })

  it('정확히 24시간 전은 아직 늦지 않았다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T19:00:00+09:00'))).toBe(false)
  })

  it('24시간을 넘기면 늦은 것이다 — 막지는 않지만 노쇼로 기록된다', () => {
    expect(isLateCancel(at, new Date('2026-08-09T19:00:01+09:00'))).toBe(true)
  })
})

describe('kstToday', () => {
  it('UTC 로 밀리지 않는다 — 한국의 아침은 전날 UTC 다', () => {
    // 2026-08-10 08:00 KST = 2026-08-09 23:00 UTC
    expect(kstToday(new Date('2026-08-10T08:00:00+09:00'))).toBe('2026-08-10')
  })

  it('한국의 자정 직후도 그날이다', () => {
    expect(kstToday(new Date('2026-08-10T00:10:00+09:00'))).toBe('2026-08-10')
  })
})

describe('kstDatePlus', () => {
  it('날짜를 더한다', () => {
    expect(kstDatePlus('2026-08-10', 6)).toBe('2026-08-16')
  })

  it('달을 넘어간다', () => {
    expect(kstDatePlus('2026-08-30', 3)).toBe('2026-09-02')
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
cd teacher-web && npm test
```
Expected: FAIL — `Cannot find module './scheduling'`

- [ ] **Step 3: 구현**

Create `teacher-web/src/domain/scheduling.ts`:

```typescript
import type { SessionSummary } from './types'

/** 편성 설계 §4.2 — 휴강 마감은 24시간. */
const CANCEL_LEAD_MS = 24 * 60 * 60 * 1000

/** 아직 일어나지 않은 수업만 휴강 대상이다. */
export function canRequestCancel(session: SessionSummary): boolean {
  return session.status === 'SCHEDULED' || session.status === 'LOBBY_OPEN'
}

/**
 * 마감을 넘겼는지 알려줄 뿐 막지 않는다.
 * 편성 설계 §4.2 — 늦은 취소도 크레딧은 동일하게 나가고, 기록만 노쇼가 된다.
 * 화면은 그 사실을 미리 보여주는 역할만 한다.
 */
export function isLateCancel(scheduledAt: string, now: Date): boolean {
  return new Date(scheduledAt).getTime() - now.getTime() < CANCEL_LEAD_MS
}

/**
 * KST 기준 오늘 날짜. `toISOString()` 은 UTC 라 한국 아침에 전날이 나온다.
 */
export function kstToday(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' 에 날짜를 더한다. 시각은 다루지 않는다. */
export function kstDatePlus(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 4: 통과 확인**

```bash
npm test
```
Expected: PASS — 35 passed (기존 26 + 신규 9)

- [ ] **Step 5: 커밋**

```bash
git add teacher-web/src/domain
git commit -m "feat(teacher-web): add scheduling decision helpers with tests"
```

---

## Task 2: API 계층에 3개 추가

**Files:** `teacher-web/src/api/client.ts`, `stub.ts`, `http.ts`

**Interfaces:**
- Produces:
  - `cancelSession(sessionId): Promise<{ status: 'CANCELLED' | 'NO_SHOW' }>`
  - `getMakeupSlots(from, to): Promise<MakeupSlots>`
  - `bookMakeup(enrollmentId, scheduledAt): Promise<void>`
  - `MakeupSlots = { slots: { date: string; times: string[] }[]; students: StudentCredit[] }`
  - `StudentCredit = { enrollmentId, studentId, studentName, creditBalance, warn }`

- [ ] **Step 1: 인터페이스 확장**

Modify `teacher-web/src/api/client.ts` — 파일 상단에 타입을 추가한다:

```typescript
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
```

`TeacherApi` 에 다음 셋을 추가한다. **기존 7개는 건드리지 않는다:**

```typescript
  /** 마감을 넘겨도 거부되지 않는다. 서버가 CANCELLED 인지 NO_SHOW 인지 알려준다. */
  cancelSession(sessionId: string): Promise<{ status: 'CANCELLED' | 'NO_SHOW' }>
  getMakeupSlots(from: string, to: string): Promise<MakeupSlots>
  bookMakeup(enrollmentId: string, scheduledAt: string): Promise<void>
```

- [ ] **Step 2: 스텁 구현**

Modify `teacher-web/src/api/stub.ts` — 세 메서드를 더한다. 스텁은 **크레딧 없음과 슬롯 충돌을 재현할 수 있어야 한다.** 그 두 경로가 화면에서 가장 틀리기 쉬운 곳이기 때문이다.

- `cancelSession` 은 해당 세션의 `status` 를 `'CANCELLED'` 로 바꾸고 그 값을 돌려준다.
- `getMakeupSlots` 는 요청 범위의 각 날짜에 대해 몇 개를 제외한 슬롯 목록과, 학생 둘(하나는 `creditBalance: 0`, 하나는 `creditBalance: 6, warn: true`)을 돌려준다.
- `bookMakeup` 은 잔액이 0인 등록에 대해서는 `throw new Error('크레딧이 없습니다')`, 이미 찬 슬롯에 대해서는 `throw new Error('이미 예약된 시간입니다')` 를 던진다.

- [ ] **Step 3: HTTP 구현**

Modify `teacher-web/src/api/http.ts` — 기존 메서드들과 같은 방식으로 셋을 더한다.

| 메서드 | 요청 |
|---|---|
| `cancelSession` | `POST {base}/sessions/{id}/cancel` |
| `getMakeupSlots` | `GET {base}/teacher/{VITE_TEACHER_ID}/makeup-slots?from=&to=` |
| `bookMakeup` | `POST {base}/makeups`, 본문 `{ enrollmentId, scheduledAt }` |

**409 는 다른 오류와 구분해서 던진다.** 슬롯을 뺏긴 것과 서버가 죽은 것은 선생님에게 전혀 다른 상황이다. 오류 메시지에 서버가 준 본문을 담는다.

- [ ] **Step 4: 타입 검사**

```bash
cd teacher-web && npm run build && npm test
```
Expected: 빌드 클린, 35 passed.

- [ ] **Step 5: 커밋**

```bash
git add teacher-web/src/api
git commit -m "feat(teacher-web): add cancel and makeup calls to the api layer"
```

---

> ⚠️ **Task 3~5 는 완전한 코드 대신 요구사항과 산문으로 되어 있다.** 이것은 이 계획의 약점이지 재량의 허가가 아니다.
>
> 편성 백엔드 계획에서 라우트 태스크를 같은 방식으로 얇게 썼고, 거기서 이 세션 최악의 결함 둘이 나왔다 — 수업 시각이 9시간 어긋난 것과, 종료를 두 번 부르면 크레딧이 두 번 나가는데 잔액-원장 대조로는 안 잡히는 것. 둘 다 "구현자가 알아서 하겠지" 로 남긴 자리에서 나왔다.
>
> 그래서 이 셋을 구현할 때는 **동작을 지어내지 말고 이미 있는 것을 읽는다**: 응답 형태는 `scheduling/src/routes/makeup.ts` 가, 화면 관행은 기존 `SessionList.tsx`·`Lobby.tsx` 가 정답이다. 브리프와 실제 코드가 다르면 실제 코드가 이긴다. Task 5 Step 3의 실 백엔드 검증이 이 얇음을 메우는 유일한 장치이므로 **건너뛰지 않는다.**

## Task 3: 담당 학생 화면

**Files:** `teacher-web/src/screens/MyStudents.tsx`, `App.tsx` 수정

**Interfaces:** Consumes `getMakeupSlots` (Task 2). Produces `<MyStudents api onBack onBook />`

- [ ] **Step 1: 화면 작성**

`getMakeupSlots` 가 학생별 크레딧을 함께 주므로 별도 호출이 필요 없다. 오늘부터 4주 범위로 부른다.

표시할 것: 학생 이름, 잔여 크레딧, 경고 표시, [보강 잡기] 버튼.

**`warn` 이 참인 학생은 눈에 띄게 표시한다.** 편성 설계 §5.2가 경고를 둔 이유는 크레딧이 쌓이기만 하고 소진할 슬롯이 없어지는 상황을 사람이 알아채게 하려는 것이다. 조용히 숫자만 크면 아무도 안 본다.

크레딧이 0인 학생은 [보강 잡기] 를 비활성화한다.

- [ ] **Step 2: 라우팅**

Modify `App.tsx` — `View` 유니온에 `{ name: 'students' }` 와 `{ name: 'makeup'; student: StudentCredit }` 를 더하고, 목록 화면에서 담당 학생 화면으로 갈 수 있게 한다.

- [ ] **Step 3: 확인**

```bash
npm run build && npm test
```
Expected: 빌드 클린, 35 passed.

스텁으로 띄워 학생 둘이 보이고, 크레딧 0인 쪽 버튼이 비활성인지 눈으로 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): add the my-students screen with credit balances"
```

---

## Task 4: 보강 예약 화면

**Files:** `teacher-web/src/screens/MakeupBooking.tsx`, `App.tsx` 수정

**Interfaces:** Consumes `getMakeupSlots`, `bookMakeup` (Task 2), `kstToday`/`kstDatePlus` (Task 1)

- [ ] **Step 1: 화면 작성**

오늘부터 4주를 날짜별 행, 슬롯을 열로 하는 그리드로 그린다. 하루 30칸이므로 한 주가 한 화면에 들어온다.

- 빈 슬롯만 클릭할 수 있다.
- 클릭하면 `bookMakeup(enrollmentId, `${date}T${time}:00+09:00`)` 를 부른다.
- **성공하면 목록을 다시 불러 그 슬롯이 사라진 것을 보여준다.** 낙관적으로 지우지 않는다 — 서버가 받아들인 것과 화면이 그렇게 믿는 것은 다르다.
- **409 는 "방금 다른 예약이 들어왔어요. 다시 골라 주세요" 로 표시하고 목록을 다시 부른다.** 조용히 실패하면 선생님은 잡혔다고 믿는다.
- 크레딧이 0이면 화면에 들어올 수 없다(Task 3에서 막음). 그래도 서버가 거부하면 그 메시지를 보여준다.

- [ ] **Step 2: 확인**

```bash
npm run build && npm test
```
Expected: 빌드 클린, 35 passed.

스텁으로 띄워 크레딧 0인 학생의 예약이 거부 메시지를 내는지, 이미 찬 슬롯이 충돌 메시지를 내는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): add the makeup booking grid"
```

---

## Task 5: 휴강 신청과 실 백엔드 검증

**Files:** `teacher-web/src/screens/SessionList.tsx` 수정

**Interfaces:** Consumes `cancelSession` (Task 2), `canRequestCancel`/`isLateCancel` (Task 1)

- [ ] **Step 1: 목록에 휴강 추가**

각 행에 [휴강] 버튼을 더한다. `canRequestCancel` 이 거짓이면 보이지 않는다.

누르면 확인을 한 번 받는다. **여기서는 확인을 둔다** — 수업 종료와 달리 휴강은 되돌릴 수 없고 연속 동작도 아니다.

`isLateCancel` 이 참이면 확인 문구에 그 사실을 넣는다:

> 하루 전 마감이 지났어요. 휴강해도 되지만 **노쇼로 기록**됩니다. 학생의 보강 크레딧은 똑같이 지급돼요.

**막지 않는다.** 편성 설계 §4.2 — 늦은 연락으로 가족을 벌하지 않는다.

성공하면 서버가 준 `status` 를 그대로 보여주고 목록을 다시 부른다.

- [ ] **Step 2: 전체 검사**

```bash
cd teacher-web && npm run build && npm test
```
Expected: 빌드 클린, 35 passed.

- [ ] **Step 3: 실 백엔드로 확인 — 이 계획의 결론**

Postgres 컨테이너를 띄우고, 선생님·학생·등록·수업 몇 개를 시드한다. 하나는 **24시간 안쪽**, 하나는 **24시간 바깥**으로 둔다.

`scheduling` 서버와 `teacher-web` 을 `VITE_API_BASE`, `VITE_TEACHER_ID` 로 붙여 띄우고 브라우저로 확인한다:

1. 24시간 바깥 수업을 휴강 → 확인 문구에 노쇼 경고가 **없고**, 결과가 `CANCELLED`
2. 24시간 안쪽 수업을 휴강 → 경고가 **있고**, 결과가 `NO_SHOW`
3. 담당 학생 화면에 크레딧이 **2 늘어 있음**
4. 보강을 잡으면 크레딧이 **1 줄고** 그 슬롯이 목록에서 사라짐
5. 같은 슬롯을 다시 잡으면 409 메시지가 뜸

마지막으로 잔액과 원장이 여전히 일치하는지 확인한다:

```sql
SELECT e.id, e."creditBalance", COALESCE(SUM(c.delta), 0) AS ledger
FROM "Enrollment" e LEFT JOIN "CreditEntry" c ON c."enrollmentId" = e.id
GROUP BY e.id, e."creditBalance";
```
Expected: 모든 행에서 두 값이 같다.

시드한 행과 임시 스크립트는 지운다.

- [ ] **Step 4: 커밋**

```bash
git add teacher-web/src
git commit -m "feat(teacher-web): add cancellation from the session list"
```

---

## 부록 — 이 계획이 하지 않는 것

| 항목 | 담당 |
|---|---|
| 운영자 화면 (학생·선생님 등록, 담임 배정, 공휴일 관리) | 별도. 지금은 API·DB 직접 |
| 선생님 인증 | 화면 설계 오픈이슈 #3. `VITE_TEACHER_ID` 가 임시방편 |
| 보호자 화면 | 범위 밖 (편성 설계 §6.3) |
| 보강 슬롯의 공휴일 제외 | 편성 백엔드 미구현. 공휴일에도 보강은 잡힐 수 있다 |
| 크레딧 경고 임계치 조정 | 편성 설계 오픈이슈 #3, 현재 5 고정 |
| 반복 시간표 편집 | 운영자 영역 |
