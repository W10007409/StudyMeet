# 수업 편성 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반복 시간표에서 수업을 미리 만들어 두고, 결석·휴강을 보강 크레딧으로 바꾸고, 선생님이 자기 빈 슬롯에 보강을 잡을 수 있게 하는 백엔드를 만든다. 선생님 수업 화면이 스텁으로 쓰고 있는 7개 엔드포인트를 진짜 구현으로 교체한다.

**Architecture:** Fastify + Prisma + PostgreSQL. 날짜·크레딧·마감 판정 같은 규칙은 전부 순수 함수로 분리해 DB 없이 테스트로 먼저 만들고, 그 위에 영속성과 HTTP를 얹는다. 세션은 반복 규칙에서 4주치를 실제 행으로 생성한다.

**Tech Stack:** Node 22 · TypeScript · Fastify 5.11.2 · Prisma 7.9.1 · zod 4.4.3 · tsx 4.23.10 · Vitest 4.1.10 · PostgreSQL 16

**설계 문서:** `docs/superpowers/specs/2026-08-07-lesson-scheduling-design.md` (이하 "설계"). 소비자는 `2026-08-07-teacher-lesson-screen-design.md`.

---

## Global Constraints

- **인터페이스 7개는 바꾸지 않는다.** 선생님 화면이 이미 그 모양으로 스텁을 쓰고 있다. 추가는 설계 §7의 3개뿐이다. (설계 §7)
- 세션은 반복 규칙에서 **4주치를 미리 행으로 생성**한다. 즉석 계산하지 않는다. 수업 하나가 메모·누적끊김·준비상태를 스스로 갖기 때문이다. (설계 §3.1)
- **공휴일에는 세션을 만들지 않는다.** 따라서 공휴일은 크레딧을 발생시키지 않는다. (설계 §4.3)
- 크레딧은 **Enrollment 단위**이며 멤버십이 살아 있는 동안 **소멸하지 않는다.** 대신 누적이 임계치를 넘으면 경고 플래그를 세운다. (설계 §5.2)
- 노쇼 자동 판정은 **시작 후 10분**이되, 선생님이 언제든 조기 처리할 수 있다. 자동 판정은 선생님이 아무 조치도 안 한 경우의 안전망이다. (설계 §4.1)
- 휴강은 **하루 전까지**. 마감을 넘긴 취소는 노쇼로 기록되며 크레딧은 동일하게 발생한다. (설계 §4.2)
- 수업 시간대는 **15:00~20:00, 10분 단위**. 선생님당 하루 최대 30슬롯. (설계 §1.2)
- **대체 선생님을 만들지 않는다.** 담임 부재는 휴강 + 보강으로만 처리한다. (설계 §2)
- 시간대는 **Asia/Seoul 고정**. 저장은 UTC, 경계 판정(하루 전, 공휴일, 슬롯)은 KST로 한다. 이것을 섞으면 하루 전 마감과 공휴일 판정이 어긋난다.
- DB 접속 정보는 **`.env` 에만** 둔다. `.env` 는 gitignore한다. **자격증명을 절대 커밋하지 않는다.**

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Task 1–3 (골격·도메인 로직) | Node 22만 있으면 됨. **DB 불필요** |
| Task 4–7 (영속성·API) | **PostgreSQL 16.** Docker 로 띄우거나 기존 인스턴스 |

Phase 0에서 쓴 것과 같은 순서다 — 환경이 없어도 되는 것을 앞에 두고, 규칙을 먼저 테스트로 고정한다.

---

## File Structure

| 경로 | 책임 |
|---|---|
| `scheduling/package.json`, `tsconfig.json`, `vitest.config.ts` | 프로젝트 설정 |
| `scheduling/.env.example` | 환경변수 견본 (커밋함) |
| `scheduling/prisma/schema.prisma` | 데이터 모델 |
| `scheduling/src/domain/slots.ts` | 수업 슬롯 그리드. 순수 함수 |
| `scheduling/src/domain/recurrence.ts` | 반복 규칙 전개 + 공휴일 제외. 순수 함수 |
| `scheduling/src/domain/deadline.ts` | 휴강 마감·노쇼 판정. 순수 함수 |
| `scheduling/src/domain/credit.ts` | 크레딧 발생·소비·경고. 순수 함수 |
| `scheduling/src/repo/*.ts` | Prisma 접근 |
| `scheduling/src/routes/*.ts` | Fastify 라우트 |
| `scheduling/src/jobs/materialize.ts` | 4주 롤링 세션 생성 |
| `scheduling/src/**/*.test.ts` | 단위 테스트 |

---

## Task 1: 프로젝트 골격

**Files:** `scheduling/package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/smoke.test.ts`, 루트 `.gitignore` 수정

**Interfaces:** Produces: `npm test` 가 도는 프로젝트

- [ ] **Step 1: 패키지 정의**

Create `scheduling/package.json`:

```json
{
  "name": "studymeet-scheduling",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc --noEmit",
    "test": "vitest run",
    "db:push": "prisma db push",
    "db:generate": "prisma generate"
  },
  "dependencies": {
    "@prisma/adapter-pg": "7.9.1",
    "@prisma/client": "7.9.1",
    "fastify": "5.11.2",
    "pg": "8.22.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/node": "22.19.1",
    "@types/pg": "8.20.4",
    "prisma": "7.9.1",
    "tsx": "4.23.10",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: 설정**

Create `scheduling/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "vitest.config.ts"]
}
```

Create `scheduling/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, environment: 'node' },
})
```

Create `scheduling/.env.example`:

```
# 실제 값은 .env 에 둔다. .env 는 커밋하지 않는다.
DATABASE_URL=postgresql://studymeet:studymeet@localhost:5432/studymeet
PORT=3000
```

Modify 루트 `.gitignore` — 끝에 추가:

```
scheduling/node_modules/
scheduling/.env
```

- [ ] **Step 3: 스모크 테스트**

Create `scheduling/src/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs TypeScript and Vitest together', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: 툴체인 확인**

```bash
cd scheduling && npm install && npm test && npm run build
```
Expected: 1 passed, `tsc --noEmit` 통과.

`typescript@7.0.2` 관련 오류가 나면 **`6.0.3` 으로 낮추고 재실행한다. 다른 버전은 건드리지 않는다.** 낮췄다는 사실과 정확한 오류를 보고한다.

`@types/node@22.19.1` 이 없다는 `ETARGET` 이 나오면 설치된 Node 22 계열의 실제 최신 버전을 `npm view @types/node version` 으로 확인해 그 값으로 바꾸고 보고한다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add .gitignore scheduling
git commit -m "feat(scheduling): scaffold the Node backend"
```

`scheduling/node_modules` 가 보이면 커밋하지 말고 `.gitignore` 를 고친다.

---

## Task 2: 슬롯 그리드와 반복 규칙 (TDD)

날짜 규칙은 이 시스템에서 가장 조용히 틀리는 부분이다. DB 없이 먼저 고정한다.

**Files:** `src/domain/slots.ts` + 테스트, `src/domain/recurrence.ts` + 테스트

**Interfaces:** Produces: `slotsOfDay()`, `isValidSlot()`, `expandRule()`

- [ ] **Step 1: 슬롯 실패 테스트**

Create `scheduling/src/domain/slots.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { isValidSlot, slotsOfDay } from './slots'

describe('slotsOfDay', () => {
  it('15:00 부터 20:00 직전까지 10분 간격으로 만든다', () => {
    const slots = slotsOfDay()
    expect(slots[0]).toBe('15:00')
    expect(slots.at(-1)).toBe('19:50')
    // 5시간 × 6 = 30. 설계 §1.2 의 "선생님당 하루 최대 30슬롯"
    expect(slots).toHaveLength(30)
  })

  it('20:00 은 포함하지 않는다 — 시작하면 20:10 에 끝난다', () => {
    expect(slotsOfDay()).not.toContain('20:00')
  })
})

describe('isValidSlot', () => {
  it('그리드 위의 시각만 받는다', () => {
    expect(isValidSlot('15:00')).toBe(true)
    expect(isValidSlot('19:50')).toBe(true)
    expect(isValidSlot('15:05')).toBe(false)
    expect(isValidSlot('14:50')).toBe(false)
    expect(isValidSlot('20:00')).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
cd scheduling && npm test
```
Expected: FAIL — `Cannot find module './slots'`

Create `scheduling/src/domain/slots.ts`:

```typescript
/** 설계 §1.2 — 수업은 15:00~20:00 사이 10분 단위 그리드 위에서만 열린다. */
export const SLOT_START_HOUR = 15
export const SLOT_END_HOUR = 20
export const SLOT_MINUTES = 10

export function slotsOfDay(): string[] {
  const out: string[] = []
  for (let h = SLOT_START_HOUR; h < SLOT_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
}

const VALID = new Set(slotsOfDay())

export function isValidSlot(hhmm: string): boolean {
  return VALID.has(hhmm)
}
```

```bash
npm test
```
Expected: PASS — 4 passed (스모크 1 포함)

- [ ] **Step 3: 반복 규칙 실패 테스트**

Create `scheduling/src/domain/recurrence.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { expandRule } from './recurrence'

const rule = { weekdays: [2, 4], time: '19:00' } // 화, 목

describe('expandRule', () => {
  it('지정한 요일에만 날짜를 만든다', () => {
    // 2026-08-03 은 월요일
    const dates = expandRule(rule, '2026-08-03', '2026-08-09', [])
    expect(dates).toEqual(['2026-08-04', '2026-08-06'])
  })

  it('공휴일은 건너뛴다 — 없어진 수업이 아니라 처음부터 없던 수업이다', () => {
    const dates = expandRule(rule, '2026-08-03', '2026-08-09', ['2026-08-06'])
    expect(dates).toEqual(['2026-08-04'])
  })

  it('여러 주에 걸쳐 만든다', () => {
    const dates = expandRule(rule, '2026-08-03', '2026-08-16', [])
    expect(dates).toHaveLength(4)
  })

  it('시작일이 해당 요일이면 그날도 포함한다', () => {
    const dates = expandRule(rule, '2026-08-04', '2026-08-04', [])
    expect(dates).toEqual(['2026-08-04'])
  })
})
```

- [ ] **Step 4: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './recurrence'`

Create `scheduling/src/domain/recurrence.ts`:

```typescript
export interface RecurrenceRule {
  /** 0=일 … 6=토 */
  weekdays: number[]
  /** 'HH:MM', 슬롯 그리드 위여야 한다 */
  time: string
}

/**
 * 반복 규칙을 실제 날짜로 편다. 설계 §3.1.
 * 날짜만 다루고 시각은 건드리지 않는다 — 시각은 규칙에 이미 들어 있다.
 * 경계 판정은 전부 KST 기준이므로 여기서는 로컬 타임존에 의존하지 않는 순수 날짜 계산만 한다.
 */
export function expandRule(
  rule: RecurrenceRule,
  fromDate: string,
  toDate: string,
  holidays: string[],
): string[] {
  const holidaySet = new Set(holidays)
  const days = new Set(rule.weekdays)
  const out: string[] = []

  const cursor = new Date(`${fromDate}T00:00:00Z`)
  const end = new Date(`${toDate}T00:00:00Z`)

  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10)
    // 공휴일에는 세션을 아예 만들지 않는다. 설계 §4.3
    if (days.has(cursor.getUTCDay()) && !holidaySet.has(iso)) out.push(iso)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return out
}
```

```bash
npm test
```
Expected: PASS — 8 passed

- [ ] **Step 5: 커밋**

```bash
git add scheduling/src/domain
git commit -m "feat(scheduling): add slot grid and recurrence expansion with tests"
```

---

## Task 3: 마감·노쇼·크레딧 판정 (TDD)

**Files:** `src/domain/deadline.ts` + 테스트, `src/domain/credit.ts` + 테스트

**Interfaces:** Produces: `canCancel()`, `isNoShow()`, `creditDelta()`, `shouldWarn()`

- [ ] **Step 1: 마감·노쇼 실패 테스트**

Create `scheduling/src/domain/deadline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { canCancel, isNoShow } from './deadline'

const startsAt = new Date('2026-08-07T19:00:00+09:00')

describe('canCancel', () => {
  it('하루 넘게 남았으면 휴강할 수 있다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T10:00:00+09:00'))).toBe(true)
  })

  it('정확히 24시간 전은 아직 된다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T19:00:00+09:00'))).toBe(true)
  })

  it('24시간을 넘기면 안 된다 — 이후 취소는 노쇼로 기록된다', () => {
    expect(canCancel(startsAt, new Date('2026-08-06T19:00:01+09:00'))).toBe(false)
    expect(canCancel(startsAt, new Date('2026-08-07T18:00:00+09:00'))).toBe(false)
  })
})

describe('isNoShow', () => {
  it('시작 후 10분이 지나면 노쇼다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T19:10:00+09:00'))).toBe(true)
  })

  it('9분 59초까지는 아직 기다리는 중이다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T19:09:59+09:00'))).toBe(false)
  })

  it('시작 전에는 노쇼가 아니다', () => {
    expect(isNoShow(startsAt, new Date('2026-08-07T18:59:00+09:00'))).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './deadline'`

Create `scheduling/src/domain/deadline.ts`:

```typescript
/** 설계 §4.2 — 휴강은 하루 전까지. 여기서 "하루"는 24시간으로 해석한다. */
export const CANCEL_LEAD_MS = 24 * 60 * 60 * 1000

/** 설계 §4.1 — 자동 노쇼 판정. 수업 길이와 같은 10분이다. */
export const NO_SHOW_AFTER_MS = 10 * 60 * 1000

export function canCancel(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() >= CANCEL_LEAD_MS
}

/**
 * 자동 판정만 담당한다.
 * 선생님은 이 시각 이전에도 [노쇼 처리] 로 직접 끝낼 수 있다 — 설계 §4.1.
 * 이 함수는 선생님이 아무 조치도 하지 않았을 때의 안전망이다.
 */
export function isNoShow(startsAt: Date, now: Date): boolean {
  return now.getTime() - startsAt.getTime() >= NO_SHOW_AFTER_MS
}
```

```bash
npm test
```
Expected: PASS — 14 passed

- [ ] **Step 3: 크레딧 실패 테스트**

Create `scheduling/src/domain/credit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CREDIT_WARN_THRESHOLD, creditDelta, shouldWarn } from './credit'

describe('creditDelta', () => {
  it('결석·노쇼·휴강은 크레딧을 만든다', () => {
    expect(creditDelta('STUDENT_ABSENT')).toBe(1)
    expect(creditDelta('NO_SHOW')).toBe(1)
    expect(creditDelta('TEACHER_CANCELLED')).toBe(1)
    expect(creditDelta('OPS_CANCELLED')).toBe(1)
  })

  it('공휴일은 크레딧을 만들지 않는다 — 처음부터 없던 수업이다', () => {
    expect(creditDelta('HOLIDAY')).toBe(0)
  })

  it('보강을 잡으면 크레딧을 쓴다', () => {
    expect(creditDelta('MAKEUP_BOOKED')).toBe(-1)
  })

  it('정상 종료는 크레딧과 무관하다', () => {
    expect(creditDelta('COMPLETED')).toBe(0)
  })
})

describe('shouldWarn', () => {
  it('임계치를 넘으면 경고한다 — 소진할 슬롯이 유한하기 때문이다', () => {
    expect(shouldWarn(CREDIT_WARN_THRESHOLD)).toBe(true)
    expect(shouldWarn(CREDIT_WARN_THRESHOLD - 1)).toBe(false)
  })
})
```

- [ ] **Step 4: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './credit'`

Create `scheduling/src/domain/credit.ts`:

```typescript
export type CreditEvent =
  | 'STUDENT_ABSENT'
  | 'NO_SHOW'
  | 'TEACHER_CANCELLED'
  | 'OPS_CANCELLED'
  | 'HOLIDAY'
  | 'MAKEUP_BOOKED'
  | 'COMPLETED'

/**
 * 설계 §5.2 — 크레딧은 소멸하지 않지만, 담임의 빈 슬롯은 하루 30개로 유한하다.
 * 쌓이기만 하고 쓸 자리가 없어지는 상황을 사람이 알아채도록 경고만 세운다.
 * 이 값은 설계 §9 오픈이슈 #3 이며 운영 확정 후 조정한다.
 */
export const CREDIT_WARN_THRESHOLD = 5

export function creditDelta(event: CreditEvent): number {
  switch (event) {
    case 'STUDENT_ABSENT':
    case 'NO_SHOW':
    case 'TEACHER_CANCELLED':
    case 'OPS_CANCELLED':
      return 1
    case 'MAKEUP_BOOKED':
      return -1
    // 공휴일은 세션 자체를 만들지 않으므로 잃은 수업이 없다. 설계 §4.3
    case 'HOLIDAY':
    case 'COMPLETED':
      return 0
  }
}

export function shouldWarn(balance: number): boolean {
  return balance >= CREDIT_WARN_THRESHOLD
}
```

```bash
npm test
```
Expected: PASS — 19 passed

- [ ] **Step 5: 커밋**

```bash
git add scheduling/src/domain
git commit -m "feat(scheduling): add cancellation, no-show and credit rules with tests"
```

---

## Task 4: 데이터 모델

여기서부터 PostgreSQL이 필요하다.

**Files:** `scheduling/prisma/schema.prisma`, `scheduling/README.md`

**Interfaces:** Produces: Prisma 클라이언트

- [ ] **Step 1: 스키마 작성**

> **Prisma 7 은 `datasource` 블록 안의 `url = env(...)` 를 더 이상 받지 않는다** (P1012). 접속 문자열은 별도 설정 파일로 옮겨졌다. 그래서 스키마에는 `provider` 만 두고, 아래 `prisma.config.ts` 가 URL을 공급한다.

Create `scheduling/prisma.config.ts`:

```typescript
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  datasource: { url: env('DATABASE_URL') },
})
```

Create `scheduling/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Teacher {
  id          String       @id @default(cuid())
  name        String
  enrollments Enrollment[]
  sessions    Session[]
}

model Student {
  id           String       @id @default(cuid())
  name         String
  guardianPhone String
  enrollments  Enrollment[]
}

/// 담임 관계. 크레딧은 학생이 아니라 이 관계에 붙는다. 설계 §3.2
model Enrollment {
  id            String           @id @default(cuid())
  studentId     String
  teacherId     String
  bookTitle     String
  membershipEnd DateTime?
  creditBalance Int              @default(0)
  student       Student          @relation(fields: [studentId], references: [id])
  teacher       Teacher          @relation(fields: [teacherId], references: [id])
  rules         RecurrenceRule[]
  sessions      Session[]
  ledger        CreditEntry[]

  @@unique([studentId, teacherId])
}

model RecurrenceRule {
  id           String     @id @default(cuid())
  enrollmentId String
  /// 0=일 … 6=토
  weekdays     Int[]
  /// 'HH:MM', 슬롯 그리드 위
  time         String
  startsOn     DateTime
  endsOn       DateTime?
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
}

enum SessionStatus {
  SCHEDULED
  LOBBY_OPEN
  IN_PROGRESS
  ENDED
  CANCELLED
  NO_SHOW
}

model Session {
  id              String        @id @default(cuid())
  enrollmentId    String
  teacherId       String
  scheduledAt     DateTime
  durationMin     Int           @default(10)
  status          SessionStatus @default(SCHEDULED)
  /// 반복 규칙에서 생성됐는지, 추가 예약·보강인지
  isMakeup        Boolean       @default(false)
  note            String        @default("")
  disconnectedSec Int           @default(0)
  endedAt         DateTime?
  enrollment      Enrollment    @relation(fields: [enrollmentId], references: [id])
  teacher         Teacher       @relation(fields: [teacherId], references: [id])

  /// 같은 선생님이 같은 슬롯에 두 수업을 가질 수 없다.
  @@unique([teacherId, scheduledAt])
  @@index([enrollmentId, scheduledAt])
}

/// 크레딧 원장. 잔액은 Enrollment 에 캐시하지만 근거는 여기 남는다.
model CreditEntry {
  id           String     @id @default(cuid())
  enrollmentId String
  delta        Int
  reason       String
  sessionId    String?
  createdAt    DateTime   @default(now())
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
}

model Holiday {
  /// 'YYYY-MM-DD' (KST 기준)
  date String @id
  name String
}
```

> **Prisma 7 은 런타임에도 드라이버 어댑터를 요구한다.** `prisma.config.ts` 는 CLI 전용이라 `new PrismaClient()` 는 `A driver adapter is required` 로 던진다. 클라이언트를 만드는 곳을 한 군데로 모은다.

Create `scheduling/src/db.ts`:

```typescript
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

export function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL 이 없다')
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
```

모든 `DateTime` 필드에는 `@db.Timestamptz(3)` 를 붙인다. 기본값은 timezone 없는 컬럼이라, 운영자가 DB를 직접 만질 때 오프셋이 조용히 잘린다.

**`materialize` 는 각 규칙의 `startsOn`/`endsOn` 으로 창을 좁혀야 한다.** 안 하면 종료된 규칙이 영원히 수업을 만들어 담임 슬롯을 잠식하고, `@@unique([teacherId, scheduledAt])` 가 진짜 예약을 막는다.

- [ ] **Step 2: 로컬 DB 문서**

Create `scheduling/README.md`:

```markdown
# 수업 편성 백엔드

## 로컬 DB

    docker run -d --name studymeet-pg \
      -e POSTGRES_USER=studymeet \
      -e POSTGRES_PASSWORD=studymeet \
      -e POSTGRES_DB=studymeet \
      -p 5432:5432 postgres:16

`.env` 를 `.env.example` 에서 복사해 만든다. **`.env` 는 커밋하지 않는다.**

    npm run db:push
    npm run db:generate
    npm run dev

## 시간대

저장은 UTC, **경계 판정은 KST**다. 하루 전 마감·공휴일·슬롯 그리드가 전부 KST 기준이므로
둘을 섞으면 조용히 하루가 어긋난다.

## 공휴일

`Holiday` 테이블에 `YYYY-MM-DD` (KST) 로 넣는다. **대체공휴일을 포함해야 한다.**
매년 갱신되므로 운영자가 수정할 수 있어야 한다.
```

- [ ] **Step 3: 스키마 적용**

Docker 로 DB를 띄운 뒤:

```bash
cd scheduling && cp .env.example .env
npm run db:push && npm run db:generate
```
Expected: `Your database is now in sync with your Prisma schema.`

Docker 가 없으면 여기서 멈추고 보고한다. Task 1–3 은 이미 끝나 있으므로 손실은 없다.

- [ ] **Step 4: 커밋**

```bash
git status --short
git add scheduling/prisma scheduling/README.md
git commit -m "feat(scheduling): add the data model"
```

`.env` 가 스테이징돼 있으면 커밋하지 말고 `.gitignore` 를 고친다.

---

## Task 5: 세션 생성 배치

**Files:** `src/jobs/materialize.ts` + 테스트

**Interfaces:** Consumes `expandRule` (Task 2). Produces: `materialize(prisma, now, weeksAhead)`

- [ ] **Step 1: 테스트 작성**

`expandRule` 은 이미 테스트돼 있으므로 여기서는 **이미 있는 세션을 다시 만들지 않는 것**만 검증한다. 배치가 매일 돌기 때문에 이것이 유일한 위험이다.

Create `scheduling/src/jobs/materialize.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { sessionsToCreate } from './materialize'

const wanted = ['2026-08-04', '2026-08-06', '2026-08-11']

describe('sessionsToCreate', () => {
  it('아직 없는 날짜만 만든다', () => {
    expect(sessionsToCreate(wanted, ['2026-08-04'])).toEqual(['2026-08-06', '2026-08-11'])
  })

  it('전부 있으면 아무것도 만들지 않는다 — 배치는 매일 돈다', () => {
    expect(sessionsToCreate(wanted, wanted)).toEqual([])
  })

  it('없던 날짜가 생겨도 기존 것을 건드리지 않는다', () => {
    expect(sessionsToCreate(wanted, [])).toEqual(wanted)
  })
})
```

- [ ] **Step 2: 실패 확인 후 구현**

```bash
npm test
```
Expected: FAIL — `Cannot find module './materialize'`

Create `scheduling/src/jobs/materialize.ts`:

```typescript
import type { PrismaClient } from '@prisma/client'
import { expandRule } from '../domain/recurrence.js'

/**
 * 배치는 매일 돈다. 이미 있는 세션을 다시 만들면 선생님 메모와 누적 끊김이 날아간다.
 * 그래서 생성 대상에서 기존 날짜를 빼는 것이 이 배치의 전부다.
 */
export function sessionsToCreate(wanted: string[], existing: string[]): string[] {
  const have = new Set(existing)
  return wanted.filter((d) => !have.has(d))
}

const WEEKS_AHEAD = 4

// expandRule 의 끝은 포함이므로 하루를 빼야 정확히 4주가 된다.
const WINDOW_DAYS = WEEKS_AHEAD * 7 - 1

/** 설계 §3.1 — 4주치를 미리 행으로 만든다. */
export async function materialize(prisma: PrismaClient, today: string): Promise<number> {
  const until = new Date(`${today}T00:00:00Z`)
  until.setUTCDate(until.getUTCDate() + WINDOW_DAYS)
  const toDate = until.toISOString().slice(0, 10)

  const holidays = (await prisma.holiday.findMany()).map((h) => h.date)
  const rules = await prisma.recurrenceRule.findMany({ include: { enrollment: true } })

  let created = 0

  for (const rule of rules) {
    const wanted = expandRule(
      { weekdays: rule.weekdays, time: rule.time },
      today,
      toDate,
      holidays,
    )

    const existing = await prisma.session.findMany({
      where: {
        enrollmentId: rule.enrollmentId,
        scheduledAt: { gte: new Date(`${today}T00:00:00+09:00`) },
        isMakeup: false,
      },
      select: { scheduledAt: true },
    })
    const existingDates = existing.map((s) =>
      new Date(s.scheduledAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10),
    )

    for (const date of sessionsToCreate(wanted, existingDates)) {
      await prisma.session.create({
        data: {
          enrollmentId: rule.enrollmentId,
          teacherId: rule.enrollment.teacherId,
          // 슬롯 시각은 KST 다. 설계의 경계 판정 규칙.
          scheduledAt: new Date(`${date}T${rule.time}:00+09:00`),
        },
      })
      created++
    }
  }

  return created
}
```

```bash
npm test
```
Expected: PASS — 22 passed

- [ ] **Step 3: 커밋**

```bash
git add scheduling/src/jobs
git commit -m "feat(scheduling): materialize four weeks of sessions idempotently"
```

---

## Task 6: 선생님 화면이 쓰는 7개 엔드포인트

스텁을 진짜 구현으로 바꾼다. **응답 형태를 바꾸지 않는다.**

**Files:** `src/server.ts`, `src/routes/teacher.ts`, `src/routes/session.ts`, `src/routes/contact.ts`

**Interfaces:** Produces: 설계 §9의 7개 엔드포인트

- [ ] **Step 1: 라우트 구현**

선생님 화면 설계 §9의 표를 그대로 옮긴다:

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/teacher/:id/sessions?date=` | `scheduledAt` 오름차순 |
| GET | `/sessions/:id/readiness` | 아이 앱 프리체크 결과 |
| POST | `/sessions/:id/nudge` | `{ delivered, reason? }` 를 **반드시** 돌려준다 |
| PUT | `/sessions/:id/note` | 메모 중간 저장 |
| POST | `/sessions/:id/end` | `{ note, disconnectedSec, reason? }` |
| GET | `/sessions/:id/token` | 시그널링 접속 정보 |
| POST | `/contacts/:studentId/reveal` | 열람 기록을 남기고 전체 번호 반환 |

요청 본문은 전부 `zod` 로 검증한다.

⚠️ **`scheduledAt` 은 `toISOString()` 으로 내보내면 안 된다.** 선생님 화면이 `scheduledAt.slice(11, 16)` 으로 시각을 표시하기 때문에, UTC 문자열을 주면 19:00 수업이 "10:00" 으로 보인다. **`+09:00` 오프셋 ISO 문자열**로 내보낸다.

⚠️ **`POST /sessions/:id/end` 는 상태가 `SCHEDULED` 가 아니면 409 로 막아야 한다.** 안 막으면 두 번 호출 시 빠진 수업 하나에 크레딧이 두 번 발급된다. 원장과 잔액을 함께 쓰므로 **잔액-원장 대조로는 이 결함이 안 잡힌다** — 둘 다 똑같이 틀린 채로 일치한다.

`POST /sessions/:id/end` 의 `reason` 은 선택이며 `'NO_SHOW'` 가 오면 상태를 `NO_SHOW` 로 두고 크레딧을 발생시킨다. 이것이 설계 §4.1의 **선생님 조기 노쇼 처리** 경로다. `reason` 이 없으면 `ENDED` 다.

`POST /sessions/:id/nudge` 는 FCM 발송 결과를 그대로 담아 돌려준다. **도달 실패를 성공으로 바꾸지 않는다** — 선생님 화면이 그 값을 보고 "알림이 전달되지 않았어요"를 띄운다. FCM 연동 자체는 이 계획 범위 밖이므로, 지금은 `{ delivered: false, reason: 'FCM_NOT_CONFIGURED' }` 를 돌려주고 그 사실을 로그에 남긴다.

- [ ] **Step 2: 서버 기동 확인**

```bash
cd scheduling && npm run dev
```
다른 터미널에서:
```bash
curl -s "http://localhost:3000/teacher/$(echo -n t1)/sessions?date=2026-08-07"
```
Expected: JSON 배열. 데이터가 없으면 `[]`.

- [ ] **Step 3: 커밋**

```bash
git add scheduling/src
git commit -m "feat(scheduling): implement the seven endpoints the teacher screen uses"
```

---

## Task 7: 휴강·보강 3개 엔드포인트

**Files:** `src/routes/makeup.ts`

**Interfaces:** Consumes `canCancel`, `creditDelta`, `slotsOfDay` (Task 2, 3)

- [ ] **Step 1: 구현**

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/sessions/:id/cancel` | `canCancel` 로 하루 전 마감 검증. 통과하면 `CANCELLED` + 크레딧 +1. **마감을 넘겼으면 400 이 아니라 `NO_SHOW` 로 기록하고 크레딧은 동일하게 발생시킨다** (설계 §4.2) |
| GET | `/teacher/:id/makeup-slots?from=&to=` | 그 기간의 빈 슬롯 + 담당 학생별 잔여 크레딧·경고 |
| POST | `/makeups` | `{ enrollmentId, scheduledAt }`. 크레딧 잔액 확인 → 세션 생성(`isMakeup: true`) → 크레딧 -1 |

빈 슬롯은 `slotsOfDay()` 에서 이미 잡힌 `Session` 을 뺀 것이다. `Session` 의 `@@unique([teacherId, scheduledAt])` 가 경쟁 상태에서의 중복 예약을 막는다.

크레딧 증감은 **`CreditEntry` 기록과 `Enrollment.creditBalance` 갱신을 한 트랜잭션에서** 한다. 둘이 어긋나면 원장과 잔액이 갈라진다.

- [ ] **Step 2: 잔액과 원장이 일치하는지 확인**

```bash
cd scheduling && npm test
```
Expected: 22 passed (기존 테스트 유지)

수동 확인 — 휴강 한 번, 보강 한 번을 태운 뒤:
```sql
SELECT e."creditBalance", COALESCE(SUM(c.delta), 0) AS ledger
FROM "Enrollment" e LEFT JOIN "CreditEntry" c ON c."enrollmentId" = e.id
GROUP BY e.id, e."creditBalance";
```
Expected: 두 값이 모든 행에서 같다. 다르면 트랜잭션이 안 걸린 것이다.

- [ ] **Step 3: 커밋**

```bash
git add scheduling/src
git commit -m "feat(scheduling): add cancellation and makeup booking"
```

---

## 부록 — 이 계획이 하지 않는 것

| 항목 | 담당 |
|---|---|
| **선생님용 편성 화면** — 휴강 신청, 보강 예약, 담당 학생 목록 (설계 §6.1) | **아직 어느 계획에도 없다.** 아래 참조 |
| 운영자 화면 (등록·담임 배정·공휴일 관리) | 별도. 지금은 API와 DB 직접 조작 |
| FCM 발송 서버측 연동 | 인프라. `nudge` 는 결과 형태만 지킨다 |
| 선생님·운영자 인증 | 선생님 화면 설계 오픈이슈 #3 |
| 정산·급여·결제 | 범위 밖 |
| 대체 선생님 | **만들지 않는다** (설계 §2) |
| 보호자 화면 | 범위 밖 (설계 §6.3) |
| `teacher-web` 을 스텁에서 진짜 API로 전환 | 이 계획 완료 후 별도 태스크. 인터페이스가 같으므로 `createStubApi` 를 `createHttpApi` 로 바꾸는 것이 전부다 |

마지막 항목이 이 설계의 핵심이다. 선생님 화면은 처음부터 이 7개 인터페이스 뒤에 있었으므로, 백엔드가 생겨도 화면 코드는 **한 줄만** 바뀐다.

### 발견된 커버리지 구멍 — 선생님용 편성 화면

이 계획을 자체 점검하다 나왔다. 설계 §6.1은 선생님용 화면 **넷**을 정의한다:

| 화면 | 어디에 있나 |
|---|---|
| 내 일정 | `teacher-web` 의 수업 목록이 겸한다 ✅ |
| **휴강 신청** | **없음** |
| **보강 예약** | **없음** |
| **담당 학생 + 잔여 크레딧** | **없음** |

`teacher-web` 구현 계획은 **수업 진행 화면**만 다루고, 이 계획은 **백엔드**만 다룬다. 그 사이에 선생님이 편성을 조작하는 화면 셋이 비어 있다.

이 계획의 Task 7이 그 화면들이 쓸 API(`cancel`, `makeup-slots`, `makeups`)를 만들므로 **백엔드는 준비된다.** 화면은 별도 계획이 필요하며, `teacher-web` 에 붙이는 것이 자연스럽다 — 같은 앱, 같은 인증, 선생님이 오가는 맥락이 하나다.

**순서**: 이 계획 완료 → `teacher-web` 을 스텁에서 진짜 API로 전환 → 편성 화면 셋 추가.
