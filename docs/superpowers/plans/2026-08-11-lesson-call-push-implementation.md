# 수업 호출 푸시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님이 대기실에서 [부르기]를 누르면 아이 태블릿에 전체화면 호출이 뜨고, [들어가기]를 누르면 앱이 수업 화면 목적지로 전환된다.

**Architecture:** 스케줄링 백엔드(Fastify+Prisma)에 `Device` 모델과 발송 경로를 만들고, 판정 로직은 순수 도메인 함수로 분리해 단위 테스트한다. 북클럽 앱(KMP)에는 안드로이드 전용으로 FCM 수신·알림·호출 액티비티를 붙이고, 화면 전환은 기존 Decompose 목적지 규약을 따른다. 수업 화면 자체는 이번 계획에서 껍데기다.

**Tech Stack:** Fastify 5 · Prisma 7 · Zod 4 · Vitest 4 · firebase-admin · Kotlin Multiplatform 2.2.20 · Compose Multiplatform 1.10.0 · Decompose 3.1.0 · Koin 4.0.0 · Ktorfit 2.7.2 · Firebase Cloud Messaging

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-11-lesson-call-push-design.md`. 충돌하면 설계가 이긴다.
- 스케줄링 백엔드 저장소 경로: `C:\Project\Android\StudyMeet\scheduling`
- 북클럽 앱 저장소 경로: `C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master`
- 두 저장소는 **별도의 Gradle/npm 프로젝트**다. 북클럽 앱은 StudyMeet 의 `settings.gradle.kts` 에 포함되지 않는다.
- 아이 식별자는 `childCustomerNumber` 다. `customerNumber`(보호자)가 아니다.
- 발송 실패를 성공으로 바꾸지 않는다. `reason` 을 반드시 돌려준다 (설계 §5.3).
- Firebase 관련 코드는 `composeApp/src/androidMain` 에만 둔다. `commonMain` 과 `:shared` 에 넣지 않는다.
- 새 Koin 모듈은 `MainApplication.kt` 와 `KoinHelper.kt` **양쪽**에 등록한다.
- 사용자 노출 문자열은 코드에 한국어 리터럴로 둔다. 이 앱에는 문자열 리소스 체계가 없다.
- 커밋 메시지는 영어, 코드 주석과 UI 문자열은 한국어. 기존 저장소 관례를 따른다.
- `google-services.json` 과 Firebase 서비스 계정 키는 **커밋하지 않는다.**

---

## File Structure

### scheduling (서버)

| 경로 | 책임 | 상태 |
|---|---|---|
| `prisma/schema.prisma` | `Device` 모델 추가, `Student.customerNumber` 추가 | 수정 |
| `src/domain/nudge.ts` | 발송 결과 → `{delivered, reason, sent, failed}` 판정, 호출 가능 상태 판정 | 신규 |
| `src/domain/nudge.test.ts` | 위 판정의 단위 테스트 | 신규 |
| `src/push/sender.ts` | `PushSender` 인터페이스, FCM 오류코드 분류 | 신규 |
| `src/push/sender.test.ts` | 오류코드 분류 단위 테스트 | 신규 |
| `src/push/fcm.ts` | firebase-admin 어댑터. 자격증명 없으면 `null` 반환 | 신규 |
| `src/routes/device.ts` | `POST /devices` | 신규 |
| `src/routes/device.test.ts` | 요청 스키마 단위 테스트 | 신규 |
| `src/routes/session.ts:37-45` | `nudge` 스텁을 실제 발송으로 교체 | 수정 |
| `src/server.ts:33-37` | `deviceRoutes` 등록, `PushSender` 주입 | 수정 |
| `package.json` | `firebase-admin` 추가 | 수정 |

### teacher-web (선생님 웹)

| 경로 | 책임 | 상태 |
|---|---|---|
| `src/domain/nudgeMessage.ts` | `reason` → 선생님이 읽을 문구 | 신규 |
| `src/domain/nudgeMessage.test.ts` | 문구 매핑 테스트 | 신규 |
| `src/screens/Lobby.tsx` | [부르기] 버튼을 준비상태와 무관하게 노출, 문구 교체 | 수정 |

### app-bookclub3 (아이 앱)

| 경로 | 책임 | 상태 |
|---|---|---|
| `gradle/libs.versions.toml` | google-services 플러그인, firebase-bom, firebase-messaging | 수정 |
| `build.gradle.kts` (root) | google-services 플러그인 선언 | 수정 |
| `composeApp/build.gradle.kts` | 플러그인 조건부 적용, androidMain 의존성 | 수정 |
| `composeApp/src/androidMain/AndroidManifest.xml` | 권한 2개, 서비스 1개, 액티비티 1개, 인텐트 필터 1개 | 수정 |
| `shared/.../core/config/ApiEndpoints.kt` | 스케줄링 백엔드 주소 | 수정 |
| `shared/.../core/datastore/UserPreferences.kt` | `childCustomerNumber` 저장/조회 | 수정 |
| `shared/.../core/auth/repository/DummyAuthRepository.kt` | 저장된 식별자 복원 | 수정 |
| `shared/.../feature/lesson/domain/model/LessonCall.kt` | 호출 페이로드 모델 | 신규 |
| `shared/.../feature/lesson/domain/usecase/RegisterDeviceUseCase.kt` | 기기 등록 | 신규 |
| `shared/.../feature/lesson/data/remote/api/LessonApi.kt` | Ktorfit 인터페이스 | 신규 |
| `shared/.../feature/lesson/data/remote/dto/DeviceRegistrationDto.kt` | 요청 DTO | 신규 |
| `shared/.../feature/lesson/data/repository/LessonRepositoryImpl.kt` | 저장소 구현 | 신규 |
| `shared/.../feature/lesson/domain/repository/LessonRepository.kt` | 저장소 인터페이스 | 신규 |
| `shared/.../feature/lesson/di/LessonModule.kt` | Koin 모듈 | 신규 |
| `shared/.../feature/lesson/presentation/viewmodel/Lesson*.kt` | MVI 4파일 | 신규 |
| `shared/.../core/navigation/Screen.kt` | `Screen.Lesson` | 수정 |
| `shared/.../core/navigation/RootComponent.kt` | `Child.Lesson`, `createChild` 분기, `openLesson()` | 수정 |
| `shared/.../core/network/di/NetworkModule.kt` | `LessonApi` 등록 | 수정 |
| `composeApp/src/commonMain/.../ui/lesson/LessonScreen.kt` | 껍데기 화면 | 신규 |
| `composeApp/src/commonMain/.../App.kt:136-160` | 렌더 분기 | 수정 |
| `composeApp/src/androidMain/.../lesson/LessonNotifications.kt` | 알림 채널·빌드·표시 | 신규 |
| `composeApp/src/androidMain/.../lesson/LessonCallActivity.kt` | 전체화면 호출 화면 | 신규 |
| `composeApp/src/androidMain/.../lesson/LessonCallMessagingService.kt` | FCM 수신 | 신규 |
| `composeApp/src/androidMain/.../lesson/DeviceTokenRegistrar.kt` | 토큰 획득·등록 | 신규 |
| `composeApp/src/androidMain/.../MainActivity.kt` | `OPEN_LESSON` 라우팅, 알림 권한 | 수정 |
| `composeApp/src/androidMain/.../MainApplication.kt:59-80` | `lessonModule` 등록 | 수정 |
| `composeApp/src/iosMain/.../KoinHelper.kt:43-64` | `lessonModule` 등록 | 수정 |

---

## Task 1: 발송 판정 도메인

`nudge` 응답을 결정하는 규칙을 순수 함수로 분리한다. 이 저장소는 라우트를 테스트하지 않고 `src/domain/*.ts` 만 테스트한다 (`domain/liveness.ts`, `domain/credit.ts` 참고). 판정이 라우트 안에 섞이면 테스트할 수 없다.

**Files:**
- Create: `scheduling/src/domain/nudge.ts`
- Test: `scheduling/src/domain/nudge.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `NudgeReason`, `NudgeOutcome`, `decideNudge(input): NudgeOutcome`, `NUDGEABLE_STATUSES`, `isNudgeable(status: string): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scheduling/src/domain/nudge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decideNudge, isNudgeable, NUDGEABLE_STATUSES } from './nudge'

describe('decideNudge', () => {
  it('자격증명이 없으면 보내지 않았다고 말한다', () => {
    expect(decideNudge({ configured: false, customerNumber: 'MC1', deviceCount: 2, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'FCM_NOT_CONFIGURED', sent: 0, failed: 0 })
  })

  it('학생에게 회원번호가 매핑되지 않았으면 그 사실을 그대로 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: null, deviceCount: 0, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'NO_CUSTOMER_NUMBER', sent: 0, failed: 0 })
  })

  it('빈 문자열 회원번호도 매핑 안 됨으로 본다', () => {
    expect(decideNudge({ configured: true, customerNumber: '   ', deviceCount: 0, sent: 0, failed: 0 }).reason)
      .toBe('NO_CUSTOMER_NUMBER')
  })

  it('등록된 기기가 없으면 토큰 실패와 구분해서 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 0, sent: 0, failed: 0 }))
      .toEqual({ delivered: false, reason: 'NO_DEVICE', sent: 0, failed: 0 })
  })

  it('기기는 있는데 전부 거절당하면 토큰 문제로 말한다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 2, sent: 0, failed: 2 }))
      .toEqual({ delivered: false, reason: 'ALL_TOKENS_INVALID', sent: 0, failed: 2 })
  })

  it('한 대라도 접수되면 전달된 것이다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 2, sent: 1, failed: 1 }))
      .toEqual({ delivered: true, reason: 'SENT', sent: 1, failed: 1 })
  })

  it('부분 성공을 숨기지 않는다 — 실패 수를 그대로 남긴다', () => {
    expect(decideNudge({ configured: true, customerNumber: 'MC1', deviceCount: 3, sent: 1, failed: 2 }).failed)
      .toBe(2)
  })
})

describe('isNudgeable', () => {
  it('예정·대기실·진행 중인 수업은 부를 수 있다', () => {
    expect(isNudgeable('SCHEDULED')).toBe(true)
    expect(isNudgeable('LOBBY_OPEN')).toBe(true)
    expect(isNudgeable('IN_PROGRESS')).toBe(true)
  })

  it('끝났거나 취소된 수업에는 아이를 부르지 않는다', () => {
    expect(isNudgeable('ENDED')).toBe(false)
    expect(isNudgeable('CANCELLED')).toBe(false)
    expect(isNudgeable('NO_SHOW')).toBe(false)
  })

  it('모르는 상태는 부를 수 없다고 본다', () => {
    expect(isNudgeable('WHATEVER')).toBe(false)
  })

  it('목록은 세 개다', () => {
    expect(NUDGEABLE_STATUSES).toEqual(['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS'])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/domain/nudge.test.ts`
Expected: FAIL — `Failed to resolve import "./nudge"`

- [ ] **Step 3: 구현한다**

`scheduling/src/domain/nudge.ts`:

```ts
/**
 * 아이를 수업에 부르는 알림의 결과 판정.
 *
 * 화면 설계 §6.1 — 도달 실패를 성공으로 바꾸지 않는다. 선생님이 다음에 할 행동이
 * reason 마다 다르기 때문이다(기기 없음이면 보호자 유선, 서버 거부면 운영 문의).
 */
export type NudgeReason =
  | 'SENT'
  | 'NO_CUSTOMER_NUMBER'
  | 'NO_DEVICE'
  | 'ALL_TOKENS_INVALID'
  | 'FCM_NOT_CONFIGURED'

export interface NudgeOutcome {
  delivered: boolean
  reason: NudgeReason
  sent: number
  failed: number
}

export interface NudgeInput {
  /** FCM 자격증명이 서버에 있는가 */
  configured: boolean
  /** 학생에 매핑된 북클럽 childCustomerNumber */
  customerNumber: string | null
  /** 그 회원번호로 등록된 기기 수 */
  deviceCount: number
  /** FCM 이 접수한 토큰 수 */
  sent: number
  /** FCM 이 거절한 토큰 수 */
  failed: number
}

export function decideNudge(input: NudgeInput): NudgeOutcome {
  const { configured, customerNumber, deviceCount, sent, failed } = input

  if (!configured) {
    return { delivered: false, reason: 'FCM_NOT_CONFIGURED', sent: 0, failed: 0 }
  }
  if (customerNumber === null || customerNumber.trim() === '') {
    return { delivered: false, reason: 'NO_CUSTOMER_NUMBER', sent: 0, failed: 0 }
  }
  if (deviceCount === 0) {
    return { delivered: false, reason: 'NO_DEVICE', sent: 0, failed: 0 }
  }
  // 한 대라도 접수되면 전달로 본다. 나머지 실패는 숨기지 않고 failed 로 함께 돌려준다.
  if (sent > 0) {
    return { delivered: true, reason: 'SENT', sent, failed }
  }
  return { delivered: false, reason: 'ALL_TOKENS_INVALID', sent, failed }
}

/**
 * 아이를 부를 수 있는 세션 상태.
 * 끝난 수업에 아이를 부르는 알림이 가서는 안 된다.
 */
export const NUDGEABLE_STATUSES = ['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS'] as const

export function isNudgeable(status: string): boolean {
  return (NUDGEABLE_STATUSES as readonly string[]).includes(status)
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/domain/nudge.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 5: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add scheduling/src/domain/nudge.ts scheduling/src/domain/nudge.test.ts
git commit -m "feat(scheduling): decide what a nudge actually did, in one place

The route cannot tell a teacher what to do next; the reason can. Keeping
the decision in a pure function is also the only way this repo tests it -
routes have no test harness, domain modules do."
```

---

## Task 2: FCM 오류 분류

FCM 이 토큰을 거절하는 이유는 두 종류다 — 그 토큰이 죽었거나(지워야 한다), 일시적 문제거나(두어야 한다). 구분하지 않으면 아이가 앱을 지운 뒤에도 영영 "보냈다"가 나온다 (설계 §5.4).

**Files:**
- Create: `scheduling/src/push/sender.ts`
- Test: `scheduling/src/push/sender.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `PushSender` 인터페이스 (`send(tokens: string[], data: Record<string,string>): Promise<SendResult>`), `SendResult { okTokens: string[]; invalidTokens: string[]; failedTokens: string[] }`, `classifyFcmError(code: string): 'invalid' | 'retryable'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scheduling/src/push/sender.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyFcmError } from './sender'

describe('classifyFcmError', () => {
  it('등록이 해제된 토큰은 지워야 한다', () => {
    expect(classifyFcmError('messaging/registration-token-not-registered')).toBe('invalid')
  })

  it('형식이 틀린 토큰도 지워야 한다', () => {
    expect(classifyFcmError('messaging/invalid-registration-token')).toBe('invalid')
  })

  it('인자 오류도 지워야 한다', () => {
    expect(classifyFcmError('messaging/invalid-argument')).toBe('invalid')
  })

  it('서버 사용 불가는 일시적이다 — 토큰을 지우지 않는다', () => {
    expect(classifyFcmError('messaging/server-unavailable')).toBe('retryable')
  })

  it('할당량 초과도 일시적이다', () => {
    expect(classifyFcmError('messaging/quota-exceeded')).toBe('retryable')
  })

  it('모르는 코드는 지우지 않는다 — 지우는 쪽이 되돌릴 수 없다', () => {
    expect(classifyFcmError('messaging/something-new')).toBe('retryable')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/push/sender.test.ts`
Expected: FAIL — `Failed to resolve import "./sender"`

- [ ] **Step 3: 구현한다**

`scheduling/src/push/sender.ts`:

```ts
/**
 * 푸시 발송자. 라우트는 이 인터페이스만 알고, 실제 FCM 은 fcm.ts 가 맡는다.
 * 테스트에서 가짜로 갈아끼우기 위한 경계다.
 */
export interface SendResult {
  /** FCM 이 접수한 토큰 */
  okTokens: string[]
  /** FCM 이 "이 토큰은 죽었다" 고 답한 토큰 — 삭제 대상 */
  invalidTokens: string[]
  /** 일시적 실패 — 남겨 두고 다음에 다시 시도한다 */
  failedTokens: string[]
}

export interface PushSender {
  send(tokens: string[], data: Record<string, string>): Promise<SendResult>
}

/**
 * FCM 오류 코드를 "토큰을 지울 것"과 "두고 볼 것"으로 가른다.
 *
 * 모르는 코드는 retryable 로 둔다. 살아 있는 토큰을 지우면 아이가 다시 앱을 열기
 * 전까지 영영 부를 수 없게 되는데, 남겨 두는 쪽의 비용은 다음 발송 한 번의 실패뿐이다.
 */
export function classifyFcmError(code: string): 'invalid' | 'retryable' {
  switch (code) {
    case 'messaging/registration-token-not-registered':
    case 'messaging/invalid-registration-token':
    case 'messaging/invalid-argument':
      return 'invalid'
    default:
      return 'retryable'
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/push/sender.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add scheduling/src/push/sender.ts scheduling/src/push/sender.test.ts
git commit -m "feat(scheduling): separate a dead push token from a bad minute

Deleting a live token is not reversible from the server side - the child
has to open the app again before anyone can call them. So an unrecognised
FCM error code keeps the token."
```

---

## Task 3: 스키마와 기기 등록 API

**Files:**
- Modify: `scheduling/prisma/schema.prisma:16-21`
- Create: `scheduling/src/routes/device.ts`
- Test: `scheduling/src/routes/device.test.ts`
- Modify: `scheduling/src/server.ts:1-9`, `scheduling/src/server.ts:33-37`

**Interfaces:**
- Consumes: 없음
- Produces: `deviceRoutes` (FastifyPluginAsync<{prisma}>), `DeviceBody` (zod 스키마), Prisma 모델 `Device`, 필드 `Student.customerNumber`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scheduling/src/routes/device.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DeviceBody } from './device'

describe('DeviceBody', () => {
  it('안드로이드 등록 요청을 받는다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'android',
      appVersion: '1.0-bookpad',
    })
    expect(parsed.success).toBe(true)
  })

  it('appVersion 은 없어도 된다 — 있으면 좋은 진단 정보일 뿐이다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'android',
    })
    expect(parsed.success).toBe(true)
  })

  it('빈 토큰은 거절한다 — 저장해 두면 발송 때 실패로만 나타난다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: '',
      platform: 'android',
    })
    expect(parsed.success).toBe(false)
  })

  it('빈 회원번호는 거절한다 — 누구의 기기인지 모르는 행이 된다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: '',
      token: 'fcm-token-abc',
      platform: 'android',
    })
    expect(parsed.success).toBe(false)
  })

  it('모르는 플랫폼은 거절한다', () => {
    const parsed = DeviceBody.safeParse({
      customerNumber: 'MC1A000000',
      token: 'fcm-token-abc',
      platform: 'windows',
    })
    expect(parsed.success).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/routes/device.test.ts`
Expected: FAIL — `Failed to resolve import "./device"`

- [ ] **Step 3: 스키마를 고친다**

`scheduling/prisma/schema.prisma` 의 `Student` 모델을 통째로 아래로 교체한다:

```prisma
model Student {
  id           String       @id @default(cuid())
  name         String
  guardianPhone String
  /// 북클럽 앱의 childCustomerNumber. 아이 태블릿으로 푸시를 보내려면 이 값이 있어야 한다.
  /// null 허용은 의도다 — 아직 매핑되지 않은 상태를 빈 문자열로 위장하지 않는다.
  customerNumber String?     @unique
  enrollments  Enrollment[]
}
```

같은 파일 맨 끝에 아래를 덧붙인다:

```prisma
/// 아이 기기의 푸시 토큰. Student 와 외래키로 잇지 않고 customerNumber 문자열로 느슨하게
/// 둔다 — 기기 등록 시점에 그 학생이 아직 이 DB 에 없을 수 있고, 그것을 이유로 등록을
/// 거절하면 아이가 조용히 알림을 못 받게 된다.
model Device {
  id             String   @id @default(cuid())
  token          String   @unique
  customerNumber String
  /// "android" | "ios"
  platform       String
  appVersion     String?
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  @@index([customerNumber])
}
```

- [ ] **Step 4: Prisma 클라이언트를 다시 만든다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm run db:generate`
Expected: `Generated Prisma Client` 로 끝난다

DB 가 붙어 있으면 이어서 `npm run db:push` 를 돌린다. DB 없이 진행하는 경우 이 단계는 건너뛰고 Task 5 검증 전에 반드시 수행한다.

- [ ] **Step 5: 라우트를 구현한다**

`scheduling/src/routes/device.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

interface Deps {
  prisma: PrismaClient
}

export const DeviceBody = z.object({
  customerNumber: z.string().min(1),
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']),
  appVersion: z.string().optional(),
})

export const deviceRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  // 인증이 없다. 설계 §9-1 의 열린 이슈이며 운영 배포 전에 반드시 닫는다.
  app.post('/devices', async (request, reply) => {
    const parsed = DeviceBody.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues })

    const { customerNumber, token, platform, appVersion } = parsed.data

    // 토큰이 기준이다. 같은 태블릿을 형제가 나눠 쓰면 마지막 등록이 이긴다 (설계 §4.2).
    await prisma.device.upsert({
      where: { token },
      create: { token, customerNumber, platform, appVersion },
      update: { customerNumber, platform, appVersion },
    })

    return reply.code(204).send()
  })
}
```

- [ ] **Step 6: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/routes/device.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 7: 서버에 등록한다**

`scheduling/src/server.ts` 의 import 목록에 한 줄을 더한다 (`import { contactRoutes } ...` 아래):

```ts
import { deviceRoutes } from './routes/device.js'
```

`app.register(operatorRoutes, { prisma })` 아래에 한 줄을 더한다:

```ts
app.register(deviceRoutes, { prisma })
```

- [ ] **Step 8: 타입 검사를 통과시킨다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm run build`
Expected: 출력 없이 종료 (tsc --noEmit)

- [ ] **Step 9: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add scheduling/prisma/schema.prisma scheduling/src/routes/device.ts scheduling/src/routes/device.test.ts scheduling/src/server.ts
git commit -m "feat(scheduling): give a student a customer number and a device to reach

The scheduling database knew students by an internal id and the BookClub
app knows them by childCustomerNumber; nothing joined the two, so there
was no answer to 'which tablet do I ring'.

Devices are keyed by token rather than by student, because one tablet is
shared between siblings and the last registration is the one holding it."
```

---

## Task 4: FCM 어댑터

**Files:**
- Create: `scheduling/src/push/fcm.ts`
- Modify: `scheduling/package.json:13-20`

**Interfaces:**
- Consumes: `PushSender`, `SendResult`, `classifyFcmError` (Task 2)
- Produces: `createFcmSender(): PushSender | null` — 자격증명이 없으면 `null`

- [ ] **Step 1: 의존성을 추가한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm install firebase-admin@^13`
Expected: `package.json` 의 `dependencies` 에 `firebase-admin` 이 추가된다. 설치된 실제 버전이 기록되므로 별도로 버전을 손으로 적지 않는다.

- [ ] **Step 2: 어댑터를 구현한다**

`scheduling/src/push/fcm.ts`:

```ts
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { classifyFcmError, type PushSender, type SendResult } from './sender.js'

/**
 * FCM 발송자. 자격증명이 없으면 null 을 돌려준다.
 *
 * 키가 없다고 서버가 뜨지 않아서는 안 된다 (설계 §5.5) — 편성·수업 기능은 푸시와
 * 무관하게 동작해야 하고, 푸시만 FCM_NOT_CONFIGURED 로 정직하게 실패하면 된다.
 */
export function createFcmSender(): PushSender | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (!raw || raw.trim() === '') return null

  if (getApps().length === 0) {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  const messaging = getMessaging()

  return {
    async send(tokens: string[], data: Record<string, string>): Promise<SendResult> {
      const result: SendResult = { okTokens: [], invalidTokens: [], failedTokens: [] }
      if (tokens.length === 0) return result

      // data-only 고우선순위. notification 필드를 넣으면 앱이 백그라운드일 때
      // 시스템이 알림을 대신 만들어 버려 전체화면 인텐트를 걸 수 없다 (설계 §6.4).
      const response = await messaging.sendEachForMulticast({
        tokens,
        data,
        android: { priority: 'high' },
      })

      response.responses.forEach((r, i) => {
        const token = tokens[i]!
        if (r.success) {
          result.okTokens.push(token)
          return
        }
        const code = r.error?.code ?? 'messaging/unknown'
        if (classifyFcmError(code) === 'invalid') {
          result.invalidTokens.push(token)
        } else {
          result.failedTokens.push(token)
        }
      })

      return result
    },
  }
}
```

- [ ] **Step 3: 타입 검사를 통과시킨다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm run build`
Expected: 출력 없이 종료

- [ ] **Step 4: 자격증명 없이도 서버가 뜨는지 확인한다**

`FCM_SERVICE_ACCOUNT_JSON` 없이 서버를 띄운다. `OPERATOR_SECRET` 은 서버 기동 조건이므로 임시값을 준다.

Run (PowerShell):

```powershell
cd C:\Project\Android\StudyMeet\scheduling
$env:OPERATOR_SECRET = "local-dev"
npm run dev
```

Expected: `Server listening at http://127.0.0.1:3000` 이 뜨고 프로세스가 살아 있다. FCM 관련 오류로 종료되지 않는다. 확인 후 Ctrl+C 로 종료한다.

DB 연결이 없어 Prisma 오류로 종료되면 그것은 이 단계의 관심사가 아니다 — 오류 메시지에 `firebase` 나 `credential` 이 없으면 통과로 본다.

- [ ] **Step 5: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add scheduling/package.json scheduling/package-lock.json scheduling/src/push/fcm.ts
git commit -m "feat(scheduling): send through FCM, or say plainly that it cannot

A missing service account key must not stop the server from starting.
Scheduling has nothing to do with push, and a lesson should not fail to
be booked because nobody has uploaded a credential yet."
```

---

## Task 5: nudge 배선

**Files:**
- Modify: `scheduling/src/routes/session.ts:1-8`, `scheduling/src/routes/session.ts:37-45`
- Modify: `scheduling/src/server.ts:21-22`, `scheduling/src/server.ts:34`

**Interfaces:**
- Consumes: `decideNudge`, `isNudgeable` (Task 1), `PushSender` (Task 2), `createFcmSender` (Task 4), Prisma `Device` (Task 3)
- Produces: `sessionRoutes` 가 `Deps { prisma, pushSender }` 를 받는다

- [ ] **Step 1: 라우트 의존성을 넓힌다**

`scheduling/src/routes/session.ts` 의 import 와 `Deps` 를 아래로 교체한다:

```ts
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { creditDelta } from '../domain/credit.js'
import { decideNudge, isNudgeable } from '../domain/nudge.js'
import type { PushSender } from '../push/sender.js'

interface Deps {
  prisma: PrismaClient
  /** FCM 자격증명이 없으면 null. 그 사실을 응답으로 정직하게 드러낸다. */
  pushSender: PushSender | null
}
```

같은 파일의 플러그인 시그니처를 교체한다:

```ts
export const sessionRoutes: FastifyPluginAsync<Deps> = async (app, { prisma, pushSender }) => {
```

- [ ] **Step 2: nudge 를 구현한다**

`session.ts:37-45` 의 `nudge` 핸들러를 통째로 아래로 교체한다:

```ts
  app.post<{ Params: { id: string } }>('/sessions/:id/nudge', async (request, reply) => {
    const session = await prisma.session.findUnique({
      where: { id: request.params.id },
      include: {
        enrollment: { include: { student: true } },
        teacher: true,
      },
    })
    if (!session) return sendNotFound(reply)

    // 끝난 수업에 아이를 부르는 알림이 가서는 안 된다.
    if (!isNudgeable(session.status)) {
      return reply.code(409).send({ error: '부를 수 있는 상태의 세션이 아니다' })
    }

    const customerNumber = session.enrollment.student.customerNumber
    const devices = customerNumber
      ? await prisma.device.findMany({ where: { customerNumber } })
      : []

    let sent = 0
    let failed = 0

    if (pushSender !== null && devices.length > 0) {
      const result = await pushSender.send(devices.map((d) => d.token), {
        type: 'lesson_call',
        sessionId: session.id,
        teacherName: session.teacher.name,
        scheduledAt: session.scheduledAt.toISOString(),
      })
      sent = result.okTokens.length
      failed = result.invalidTokens.length + result.failedTokens.length

      // 죽은 토큰을 남겨 두면 아이가 앱을 지운 뒤에도 영영 "보냈다"가 나온다.
      if (result.invalidTokens.length > 0) {
        await prisma.device.deleteMany({ where: { token: { in: result.invalidTokens } } })
      }
    }

    const outcome = decideNudge({
      configured: pushSender !== null,
      customerNumber,
      deviceCount: devices.length,
      sent,
      failed,
    })

    request.log.info(
      { sessionId: session.id, customerNumber, deviceCount: devices.length, ...outcome },
      'nudge result',
    )
    return outcome
  })
```

- [ ] **Step 3: 서버 배선을 고친다**

`scheduling/src/server.ts` 의 import 목록에 한 줄을 더한다:

```ts
import { createFcmSender } from './push/fcm.js'
```

`const app = Fastify({ logger: true })` 아래에 한 줄을 더한다:

```ts
const pushSender = createFcmSender()
```

`app.register(sessionRoutes, { prisma })` 를 아래로 교체한다:

```ts
app.register(sessionRoutes, { prisma, pushSender })
```

- [ ] **Step 4: 전체 테스트와 타입 검사를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm test && npm run build`
Expected: 모든 테스트 PASS, tsc 출력 없음

- [ ] **Step 5: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add scheduling/src/routes/session.ts scheduling/src/server.ts
git commit -m "feat(scheduling): make the nudge actually ring a tablet

It returned FCM_NOT_CONFIGURED unconditionally, which was honest but
final. Now it looks up the child's devices, sends, prunes tokens FCM
reports dead, and reports which of those four things happened.

Calling a child into a lesson that already ended is rejected outright."
```

---

## Task 6: 선생님 웹 — 문구와 버튼 위치

지금 [알림 보내기] 버튼은 "준비 안 됨" 경고 상자 안에만 있다 (`Lobby.tsx:27-56`). 준비상태 API 가 스텁이라 항상 보이지만, 그것이 제대로 동작하는 순간 준비된 아이는 부를 수 없게 된다. 부르는 것과 준비상태는 다른 문제다.

**Files:**
- Create: `teacher-web/src/domain/nudgeMessage.ts`
- Test: `teacher-web/src/domain/nudgeMessage.test.ts`
- Modify: `teacher-web/src/screens/Lobby.tsx:14`, `:33-42`, `:58-59`

**Interfaces:**
- Consumes: 서버의 `reason` 값 (Task 1 의 `NudgeReason`)
- Produces: `nudgeMessage(result: { delivered: boolean; reason?: string }): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`teacher-web/src/domain/nudgeMessage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nudgeMessage } from './nudgeMessage'

describe('nudgeMessage', () => {
  it('전달됐으면 그렇게 말한다', () => {
    expect(nudgeMessage({ delivered: true, reason: 'SENT' })).toBe('알림을 보냈어요')
  })

  it('기기가 없으면 보호자 연락을 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'NO_DEVICE' }))
      .toBe('아이 기기에 앱이 등록되어 있지 않아요 — 연락처로 안내해 주세요')
  })

  it('회원번호 미매핑은 운영 문의로 안내한다 — 선생님이 할 수 있는 일이 아니다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'NO_CUSTOMER_NUMBER' }))
      .toBe('아이 정보가 연결되어 있지 않아요 — 운영팀에 문의해 주세요')
  })

  it('토큰이 전부 거절되면 보호자 연락을 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'ALL_TOKENS_INVALID' }))
      .toBe('아이 기기에 알림이 닿지 않았어요 — 연락처로 안내해 주세요')
  })

  it('서버에 알림 설정이 없으면 운영 문의로 안내한다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'FCM_NOT_CONFIGURED' }))
      .toBe('알림 서버가 아직 설정되지 않았어요 — 운영팀에 문의해 주세요')
  })

  it('모르는 이유도 삼키지 않는다 — 원문을 함께 보여준다', () => {
    expect(nudgeMessage({ delivered: false, reason: 'WHAT_IS_THIS' }))
      .toBe('알림이 전달되지 않았어요 — 연락처로 시도해 주세요 (WHAT_IS_THIS)')
  })

  it('이유가 아예 없어도 실패는 실패라고 말한다', () => {
    expect(nudgeMessage({ delivered: false }))
      .toBe('알림이 전달되지 않았어요 — 연락처로 시도해 주세요')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\teacher-web && npx vitest run src/domain/nudgeMessage.test.ts`
Expected: FAIL — `Failed to resolve import "./nudgeMessage"`

- [ ] **Step 3: 구현한다**

`teacher-web/src/domain/nudgeMessage.ts`:

```ts
/**
 * 발송 결과를 선생님이 다음에 할 행동으로 번역한다.
 *
 * 설계 §5.3 — reason 마다 취할 행동이 다르다. "기기 없음"은 보호자 유선 안내이고
 * "서버 미설정"은 운영 문의다. 하나의 문구로 뭉치면 선생님이 헛수고를 한다.
 */
export function nudgeMessage(result: { delivered: boolean; reason?: string }): string {
  if (result.delivered) return '알림을 보냈어요'

  switch (result.reason) {
    case 'NO_DEVICE':
      return '아이 기기에 앱이 등록되어 있지 않아요 — 연락처로 안내해 주세요'
    case 'ALL_TOKENS_INVALID':
      return '아이 기기에 알림이 닿지 않았어요 — 연락처로 안내해 주세요'
    case 'NO_CUSTOMER_NUMBER':
      return '아이 정보가 연결되어 있지 않아요 — 운영팀에 문의해 주세요'
    case 'FCM_NOT_CONFIGURED':
      return '알림 서버가 아직 설정되지 않았어요 — 운영팀에 문의해 주세요'
    case undefined:
      return '알림이 전달되지 않았어요 — 연락처로 시도해 주세요'
    default:
      // 모르는 이유를 삼키면 원인을 추적할 수 없다.
      return `알림이 전달되지 않았어요 — 연락처로 시도해 주세요 (${result.reason})`
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\teacher-web && npx vitest run src/domain/nudgeMessage.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: 화면을 고친다**

`teacher-web/src/screens/Lobby.tsx` 의 import 목록에 한 줄을 더한다:

```tsx
import { nudgeMessage } from '../domain/nudgeMessage'
```

경고 상자 안의 `<button onClick={...}>알림 보내기</button>` 블록(`:33-42`)을 통째로 지운다. 즉 아래 부분을 지운다:

```tsx
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
```

그리고 `{/* 준비 실패여도 시작할 수 있다. 설계 §6.3 */}` 주석 바로 위에 아래를 넣는다:

```tsx
      {/*
        부르기는 준비상태와 무관하다. 경고 상자 안에 두면 준비상태 API 가 제대로
        동작하는 순간 준비된 아이는 부를 수 없게 된다.
      */}
      <p>
        <button onClick={async () => {
          const r = await api.nudge(session.sessionId)
          setNudgeResult(nudgeMessage(r))
        }}>
          아이 부르기
        </button>
        {nudgeResult && <span style={{ marginLeft: 12 }}>{nudgeResult}</span>}
      </p>
```

- [ ] **Step 6: 전체 테스트를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\teacher-web && npm test`
Expected: 모든 테스트 PASS

- [ ] **Step 7: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add teacher-web/src/domain/nudgeMessage.ts teacher-web/src/domain/nudgeMessage.test.ts teacher-web/src/screens/Lobby.tsx
git commit -m "feat(teacher-web): let the teacher call a child who is already ready

The button lived inside the not-ready warning box, which is invisible the
moment the readiness stub is replaced by something that works. Calling a
child in and diagnosing their camera are different jobs.

Each failure reason now names the action it implies: a missing device is
a phone call, a missing mapping is an ops ticket."
```

---

## Task 7: 북클럽 앱 — Firebase 배관

**Files:**
- Modify: `gradle/libs.versions.toml`
- Modify: `build.gradle.kts` (root)
- Modify: `composeApp/build.gradle.kts:13-19`, `:39-51`
- Modify: `composeApp/src/androidMain/AndroidManifest.xml:4-6`

**Interfaces:**
- Consumes: 없음
- Produces: `com.google.firebase:firebase-messaging` 이 `composeApp` 안드로이드 소스셋에서 사용 가능

이 태스크의 모든 경로는 북클럽 저장소 기준이다: `C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master`

- [ ] **Step 1: 버전 카탈로그에 추가한다**

`gradle/libs.versions.toml` 의 `[versions]` 에 두 줄을 더한다:

```toml
googleServices = "4.4.2"
firebaseBom = "34.1.0"
```

`[libraries]` 에 한 줄을 더한다:

```toml
firebase-bom = { module = "com.google.firebase:firebase-bom", version.ref = "firebaseBom" }
firebase-messaging = { module = "com.google.firebase:firebase-messaging" }
```

`[plugins]` 에 한 줄을 더한다:

```toml
googleServices = { id = "com.google.gms.google-services", version.ref = "googleServices" }
```

- [ ] **Step 2: 루트 빌드에 선언한다**

`build.gradle.kts` (루트) 의 `plugins` 블록 마지막에 한 줄을 더한다:

```kotlin
    alias(libs.plugins.googleServices) apply false
```

- [ ] **Step 3: composeApp 에 조건부로 적용한다**

`composeApp/build.gradle.kts` 의 `plugins` 블록 **바로 아래**에 아래를 넣는다:

```kotlin
// google-services 플러그인은 google-services.json 이 없으면 빌드를 실패시킨다.
// 그 파일은 커밋하지 않는 자격증명이므로, 없는 환경에서도 앱이 빌드되도록 조건부로 적용한다.
// 파일이 없으면 푸시만 동작하지 않고 나머지는 그대로 뜬다.
val googleServicesJson = project.file("google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle("composeApp/google-services.json 이 없어 FCM 이 비활성화된 채로 빌드된다")
}
```

- [ ] **Step 4: 의존성을 추가한다**

`composeApp/build.gradle.kts` 의 `androidMain.dependencies` 블록 끝(`implementation(libs.androidx.webkit)` 아래)에 아래를 넣는다:

```kotlin
            // FCM. androidMain 에만 둔다 — commonMain 에 넣으면 iOS 빌드가 깨진다.
            implementation(project.dependencies.platform(libs.firebase.bom))
            implementation(libs.firebase.messaging)
```

- [ ] **Step 5: 권한을 추가한다**

`composeApp/src/androidMain/AndroidManifest.xml` 의 `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />` 아래에 두 줄을 더한다:

```xml
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <!--
      Android 14 부터 전체화면 인텐트는 통화·알람 앱에만 기본 허용된다.
      거부되면 헤드업 알림으로 떨어지며, 그 경로도 정상 동작해야 한다 (설계 §6.7).
    -->
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
```

- [ ] **Step 6: 빌드를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:assembleBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`, 그리고 로그에 `composeApp/google-services.json 이 없어 FCM 이 비활성화된 채로 빌드된다`

`firebase-bom` 버전이 해결되지 않으면 `Could not find com.google.firebase:firebase-bom:34.1.0` 이 뜬다. 그 경우 https://firebase.google.com/support/release-notes/android 에서 최신 BoM 버전을 확인해 `libs.versions.toml` 의 `firebaseBom` 을 바꾸고 다시 돌린다.

- [ ] **Step 7: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add gradle/libs.versions.toml build.gradle.kts composeApp/build.gradle.kts composeApp/src/androidMain/AndroidManifest.xml
git commit -m "build: wire FCM into the Android side only

The plugin is applied conditionally because google-services.json is a
credential we do not commit, and a missing credential should cost the
build push support, not the build itself.

Firebase stays out of commonMain: an Android-only SDK in shared code
breaks the iOS framework link for no gain."
```

---

## Task 8: 아이 식별자 영속화

푸시로 깨어난 앱은 런처 인텐트가 없어 `childCustomerNumber` 가 기본 더미값(`MC1A000000`)으로 남는다. 이 값이 없으면 어떤 API 도 아이의 것을 돌려주지 않는다.

**Files:**
- Modify: `shared/src/commonMain/.../core/datastore/UserPreferences.kt`
- Test: `shared/src/commonTest/kotlin/com/wjthinkbig/bookclub3app/core/datastore/UserPreferencesTest.kt`
- Modify: `shared/src/commonMain/.../core/auth/repository/DummyAuthRepository.kt`

**Interfaces:**
- Consumes: 없음
- Produces: `UserPreferences.getChildCustomerNumber(): String?`, `UserPreferences.setChildCustomerNumber(value: String)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`shared/src/commonTest/kotlin/com/wjthinkbig/bookclub3app/core/datastore/UserPreferencesTest.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.core.datastore

import com.russhwolf.settings.MapSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class UserPreferencesTest {

    @Test
    fun `저장한 적이 없으면 null 이다 - 더미값을 진짜처럼 돌려주지 않는다`() {
        val prefs = UserPreferences(MapSettings())
        assertNull(prefs.getChildCustomerNumber())
    }

    @Test
    fun `저장하면 그대로 돌려준다`() {
        val prefs = UserPreferences(MapSettings())
        prefs.setChildCustomerNumber("MC1A123456")
        assertEquals("MC1A123456", prefs.getChildCustomerNumber())
    }

    @Test
    fun `다시 저장하면 마지막 값이 남는다 - 형제가 같은 태블릿을 쓸 수 있다`() {
        val prefs = UserPreferences(MapSettings())
        prefs.setChildCustomerNumber("MC1A111111")
        prefs.setChildCustomerNumber("MC1A222222")
        assertEquals("MC1A222222", prefs.getChildCustomerNumber())
    }

    @Test
    fun `빈 값은 저장하지 않는다 - 저장하면 복원 때 빈 회원번호로 API 를 부른다`() {
        val prefs = UserPreferences(MapSettings())
        prefs.setChildCustomerNumber("MC1A111111")
        prefs.setChildCustomerNumber("  ")
        assertEquals("MC1A111111", prefs.getChildCustomerNumber())
    }

    @Test
    fun `clearAll 은 회원번호도 지운다`() {
        val prefs = UserPreferences(MapSettings())
        prefs.setChildCustomerNumber("MC1A111111")
        prefs.clearAll()
        assertNull(prefs.getChildCustomerNumber())
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :shared:testDebugUnitTest --console=plain`
Expected: FAIL — `Unresolved reference: getChildCustomerNumber`

`MapSettings` 를 못 찾는다는 오류가 함께 나오면 `shared/build.gradle.kts` 의 `commonTest.dependencies` 블록에 아래 한 줄을 추가한다. `MapSettings` 는 multiplatform-settings 본체에 들어 있다.

```kotlin
            implementation(libs.multiplatform.settings)
```

- [ ] **Step 3: 구현한다**

`shared/src/commonMain/.../core/datastore/UserPreferences.kt` 를 통째로 아래로 교체한다:

```kotlin
package com.wjthinkbig.bookclub3app.core.datastore

import com.russhwolf.settings.Settings
import com.russhwolf.settings.set

/**
 * 사용자 설정 저장소
 *
 * 다크모드, 폰트 크기 등 사용자 커스터마이징 설정을 저장합니다.
 */
class UserPreferences(private val settings: Settings) {

    companion object {
        private const val KEY_IS_DARK_MODE = "is_dark_mode"
        private const val KEY_FONT_SIZE = "font_size"
        private const val DEFAULT_FONT_SIZE = 14
        private const val KEY_CHILD_CUSTOMER_NUMBER = "child_customer_number"
    }

    /**
     * 다크모드 설정 여부
     */
    fun isDarkMode(): Boolean = settings.getBoolean(KEY_IS_DARK_MODE, false)

    fun setDarkMode(enabled: Boolean) {
        settings[KEY_IS_DARK_MODE] = enabled
    }

    /**
     * 폰트 크기 (단위: sp)
     */
    fun getFontSize(): Int = settings.getInt(KEY_FONT_SIZE, DEFAULT_FONT_SIZE)

    fun setFontSize(size: Int) {
        settings[KEY_FONT_SIZE] = size
    }

    /**
     * 마지막으로 확인된 자녀 회원번호.
     *
     * 푸시로 앱이 깨어나면 런처를 거치지 않아 Intent extras 가 없다. 그때 이 값이 없으면
     * 앱은 자기가 누구인지 모른 채 기본 더미값으로 API 를 부르게 된다.
     * 저장한 적이 없으면 null 이다 — 없는 것을 있는 척하지 않는다.
     */
    fun getChildCustomerNumber(): String? = settings.getStringOrNull(KEY_CHILD_CUSTOMER_NUMBER)

    fun setChildCustomerNumber(value: String) {
        // 빈 값을 저장하면 복원 시점에 빈 회원번호로 API 를 부르게 된다. 그냥 무시한다.
        if (value.isBlank()) return
        settings[KEY_CHILD_CUSTOMER_NUMBER] = value
    }

    /**
     * 모든 설정 초기화
     */
    fun clearAll() {
        settings.remove(KEY_IS_DARK_MODE)
        settings.remove(KEY_FONT_SIZE)
        settings.remove(KEY_CHILD_CUSTOMER_NUMBER)
    }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :shared:testDebugUnitTest --console=plain`
Expected: `BUILD SUCCESSFUL`, `UserPreferencesTest` 5개 통과

- [ ] **Step 5: 세션 초기화에서 저장하고 복원한다**

`shared/src/commonMain/.../core/auth/repository/DummyAuthRepository.kt` 의 생성자에 `userPreferences` 를 더하고, `initSession()` 안에서 저장·복원한다. 클래스 선언과 `initSession` 을 아래로 교체한다:

```kotlin
class DummyAuthRepository(
    private val tokenStorage: TokenStorage,
    private val sessionParams: BookPadSessionParams,
    private val userPreferences: UserPreferences,
) : AuthRepository {

    private var userSession: UserSession? = null

    override suspend fun initSession(): Boolean {
        tokenStorage.saveTokens(DUMMY_ACCESS_TOKEN, DUMMY_REFRESH_TOKEN)

        // 런처가 준 값이 기본 더미값과 다르면 그것이 진짜다 — 저장한다.
        // 같으면 푸시로 깨어난 경우일 수 있으므로 저장된 값을 되살린다.
        val fromLauncher = sessionParams.childCustomerNumber
        val resolved = if (fromLauncher != BookPadSessionParams.DEFAULT_CHILD_CUSTOMER_NUMBER) {
            userPreferences.setChildCustomerNumber(fromLauncher)
            fromLauncher
        } else {
            userPreferences.getChildCustomerNumber() ?: fromLauncher
        }
        sessionParams.childCustomerNumber = resolved

        userSession = UserSession(
            contractNumber = sessionParams.contractNumber,
            customerNumber = sessionParams.customerNumber,
            childCustomerNumber = resolved,
            memberCode = DUMMY_MEMBER_CODE,
            packageName = DUMMY_PACKAGE_NAME,
        )
        return true
    }
```

파일 상단 import 에 한 줄을 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.core.datastore.UserPreferences
```

- [ ] **Step 6: Koin 배선을 고친다**

`shared/src/commonMain/.../core/auth/di/AuthModule.kt` 의 `DummyAuthRepository` 생성 부분에 인자를 하나 더한다. `single<AuthRepository> { DummyAuthRepository(get(), get()) }` 를 아래로 교체한다:

```kotlin
    single<AuthRepository> { DummyAuthRepository(get(), get(), get()) }
```

`authModule` 은 `datastoreModule()` 보다 뒤에 등록되므로 (`MainApplication.kt:65,68`) `UserPreferences` 는 이미 준비돼 있다.

- [ ] **Step 7: 빌드와 테스트를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :shared:testDebugUnitTest :composeApp:assembleBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 8: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/datastore/UserPreferences.kt shared/src/commonTest shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/auth
git commit -m "fix(auth): remember which child this tablet belongs to

The identifier arrived from a launcher intent and lived in memory only,
so an app started by anything other than the launcher - a push, for one -
would call every API as the dummy customer.

The launcher still wins when it supplies a value; storage only fills the
gap when it does not."
```

---

## Task 9: lesson 기능 골격과 기기 등록

**Files:**
- Modify: `shared/.../core/config/ApiEndpoints.kt:41-43`
- Create: `shared/.../feature/lesson/data/remote/dto/DeviceRegistrationDto.kt`
- Create: `shared/.../feature/lesson/data/remote/api/LessonApi.kt`
- Create: `shared/.../feature/lesson/domain/repository/LessonRepository.kt`
- Create: `shared/.../feature/lesson/data/repository/LessonRepositoryImpl.kt`
- Create: `shared/.../feature/lesson/domain/usecase/RegisterDeviceUseCase.kt`
- Create: `shared/.../feature/lesson/di/LessonModule.kt`
- Modify: `shared/.../core/network/di/NetworkModule.kt:23-25`, `:44-51`, `:53-62`
- Modify: `composeApp/src/androidMain/.../MainApplication.kt:59-80`
- Modify: `composeApp/src/iosMain/.../KoinHelper.kt:43-64`

패키지 접두사는 모두 `com.wjthinkbig.bookclub3app` 이다.

**Interfaces:**
- Consumes: `UserSessionManager` (기존)
- Produces: `LessonApi`, `LessonRepository.registerDevice(customerNumber, token, platform, appVersion): Result<Unit>`, `RegisterDeviceUseCase(customerNumber, token, platform, appVersion): Result<Unit>`, `lessonModule`

- [ ] **Step 1: 엔드포인트를 추가한다**

`shared/.../core/config/ApiEndpoints.kt` 의 `// 필요시 추가` 주석 위에 아래를 넣는다:

```kotlin
    /**
     * StudyMeet 스케줄링 백엔드.
     * 북클럽 게이트웨이와 다른 서버이며 `{resultCode, resultMessage, data}` 봉투를 쓰지 않는다.
     */
    const val STUDYMEET = "http://10.0.2.2:3000/"
```

`10.0.2.2` 는 에뮬레이터에서 호스트 PC 를 가리키는 주소다. 실기기로 검증할 때는 PC 의 LAN IP 로 바꾸거나 `adb reverse tcp:3000 tcp:3000` 을 걸고 `http://localhost:3000/` 을 쓴다.

- [ ] **Step 2: DTO 를 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/data/remote/dto/DeviceRegistrationDto.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * POST /devices 요청 바디.
 * 스케줄링 백엔드는 북클럽 게이트웨이의 응답 봉투를 쓰지 않고 204 를 돌려준다.
 */
@Serializable
data class DeviceRegistrationDto(
    val customerNumber: String,
    val token: String,
    val platform: String,
    val appVersion: String? = null,
)
```

- [ ] **Step 3: API 인터페이스를 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/data/remote/api/LessonApi.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.data.remote.api

import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto.DeviceRegistrationDto
import de.jensklingenberg.ktorfit.http.Body
import de.jensklingenberg.ktorfit.http.POST

interface LessonApi {
    /** 기기 푸시 토큰 등록. 성공 시 204 라 본문이 없다. */
    @POST("devices")
    suspend fun registerDevice(@Body body: DeviceRegistrationDto)
}
```

- [ ] **Step 4: 저장소를 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/domain/repository/LessonRepository.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.repository

interface LessonRepository {
    suspend fun registerDevice(
        customerNumber: String,
        token: String,
        platform: String,
        appVersion: String?,
    ): Result<Unit>
}
```

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/data/repository/LessonRepositoryImpl.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.data.repository

import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.api.LessonApi
import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto.DeviceRegistrationDto
import com.wjthinkbig.bookclub3app.feature.lesson.domain.repository.LessonRepository

class LessonRepositoryImpl(
    private val api: LessonApi,
) : LessonRepository {

    // 이 저장소의 다른 구현들과 같이 runCatching 을 오류 경계로 쓴다.
    override suspend fun registerDevice(
        customerNumber: String,
        token: String,
        platform: String,
        appVersion: String?,
    ): Result<Unit> = runCatching {
        api.registerDevice(
            DeviceRegistrationDto(
                customerNumber = customerNumber,
                token = token,
                platform = platform,
                appVersion = appVersion,
            )
        )
    }
}
```

- [ ] **Step 5: UseCase 와 Koin 모듈을 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/domain/usecase/RegisterDeviceUseCase.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase

import com.wjthinkbig.bookclub3app.feature.lesson.domain.repository.LessonRepository

class RegisterDeviceUseCase(
    private val repository: LessonRepository,
) {
    suspend operator fun invoke(
        customerNumber: String,
        token: String,
        platform: String,
        appVersion: String?,
    ): Result<Unit> = repository.registerDevice(customerNumber, token, platform, appVersion)
}
```

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/di/LessonModule.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.di

import com.wjthinkbig.bookclub3app.feature.lesson.data.repository.LessonRepositoryImpl
import com.wjthinkbig.bookclub3app.feature.lesson.domain.repository.LessonRepository
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.RegisterDeviceUseCase
import org.koin.dsl.module

val lessonModule = module {
    single<LessonRepository> { LessonRepositoryImpl(get()) }
    factory { RegisterDeviceUseCase(get()) }
}
```

- [ ] **Step 6: 네트워크 모듈에 등록한다**

`shared/.../core/network/di/NetworkModule.kt` 의 import 에 두 줄을 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.api.LessonApi
import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.api.createLessonApi
```

`single<Ktorfit>(named("bookclub-dev"))` 블록 아래에 아래를 넣는다:

```kotlin
    // StudyMeet 스케줄링 백엔드 Ktorfit 인스턴스.
    single<Ktorfit>(named("studymeet")) {
        val httpClient = get<HttpClientFactory>().create(ApiEndpoints.STUDYMEET)
        Ktorfit.Builder()
            .baseUrl(ApiEndpoints.STUDYMEET)
            .httpClient(httpClient)
            .build()
    }
```

`single<ViewerApi> { ... }` 아래에 한 줄을 더한다:

```kotlin
    single<LessonApi> { get<Ktorfit>(named("studymeet")).createLessonApi() }
```

- [ ] **Step 7: Koin 모듈 목록 양쪽에 등록한다**

`composeApp/src/androidMain/.../MainApplication.kt` 의 `todayModule,` 아래에 한 줄을 더한다:

```kotlin
                lessonModule,
```

import 에도 한 줄을 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.di.lessonModule
```

`composeApp/src/iosMain/.../KoinHelper.kt` 에도 **동일하게** `todayModule,` 아래에 `lessonModule,` 을 더하고 같은 import 를 더한다. 한쪽만 고치면 iOS 에서 런타임에 의존성을 못 찾는다.

- [ ] **Step 8: 빌드를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:assembleBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`. KSP 가 `createLessonApi` 를 생성하므로 import 가 해결된다.

- [ ] **Step 9: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/config/ApiEndpoints.kt shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/network/di/NetworkModule.kt composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainApplication.kt composeApp/src/iosMain/kotlin/com/wjthinkbig/bookclub3app/KoinHelper.kt
git commit -m "feat(lesson): reach the scheduling backend from the child app

It is a different host with a different response shape from the BookClub
gateway, so it gets its own Ktorfit instance rather than bending the
existing one.

The module is registered on both platforms even though only Android will
send a token: a module list that differs between MainApplication and
KoinHelper is a runtime failure nobody sees until iOS runs."
```

---

## Task 10: 수업 화면 목적지

**Files:**
- Modify: `shared/.../core/navigation/Screen.kt:70-72`
- Create: `shared/.../feature/lesson/presentation/viewmodel/LessonUiState.kt`
- Create: `shared/.../feature/lesson/presentation/viewmodel/LessonIntent.kt`
- Create: `shared/.../feature/lesson/presentation/viewmodel/LessonSideEffect.kt`
- Create: `shared/.../feature/lesson/presentation/viewmodel/LessonComponent.kt`
- Modify: `shared/.../core/navigation/RootComponent.kt:72-81`, `:215-218`
- Create: `composeApp/src/commonMain/.../ui/lesson/LessonScreen.kt`
- Modify: `composeApp/src/commonMain/.../App.kt:136-160`

**Interfaces:**
- Consumes: 없음
- Produces: `Screen.Lesson(sessionId: String)`, `RootComponent.Child.Lesson`, `RootComponent.openLesson(sessionId: String)`, `LessonComponent`, `LessonScreen(component)`

- [ ] **Step 1: 목적지를 추가한다**

`shared/.../core/navigation/Screen.kt` 의 `WebView` 데이터 클래스 아래, 닫는 `}` 위에 아래를 넣는다:

```kotlin
    /**
     * 수업 화면.
     *
     * @param sessionId 스케줄링 백엔드의 세션 id. 방 이름이기도 하다.
     */
    @Serializable
    data class Lesson(val sessionId: String) : Screen()
```

- [ ] **Step 2: MVI 4파일을 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/presentation/viewmodel/LessonUiState.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

data class LessonUiState(
    val sessionId: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)
```

`.../LessonIntent.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

sealed class LessonIntent {
    data object Leave : LessonIntent()
}
```

`.../LessonSideEffect.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

sealed class LessonSideEffect {
    data class ShowToast(val message: String) : LessonSideEffect()
}
```

`.../LessonComponent.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.doOnDestroy
import com.wjthinkbig.bookclub3app.core.common.SideEffectComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow

/**
 * 수업 화면.
 *
 * 이번 단계에서는 방에 들어왔다는 사실만 보여준다. 실제 통화(WebRTC·PiP)는
 * 화상 모듈 스펙에서 이 Component 뒤에 붙는다.
 */
class LessonComponent(
    componentContext: ComponentContext,
    sessionId: String,
    private val onLeave: () -> Unit,
) : ComponentContext by componentContext, SideEffectComponent<LessonSideEffect> {

    private val componentScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _uiState = MutableStateFlow(LessonUiState(sessionId = sessionId))
    val uiState = _uiState.asStateFlow()

    private val _sideEffect = Channel<LessonSideEffect>(Channel.BUFFERED)
    override val sideEffect: Flow<LessonSideEffect> = _sideEffect.receiveAsFlow()

    init {
        lifecycle.doOnDestroy { componentScope.cancel() }
    }

    fun handleIntent(intent: LessonIntent) {
        when (intent) {
            is LessonIntent.Leave -> onLeave()
        }
    }

    fun navigateBack() = onLeave()
}
```

- [ ] **Step 3: RootComponent 에 배선한다**

`shared/.../core/navigation/RootComponent.kt` 의 `Child` 인터페이스에 한 줄을 더한다 (`data class WebView(...)` 아래):

```kotlin
        data class Lesson(val component: LessonComponent) : Child
```

`createChild` 의 `is Screen.WebView -> ...` 분기 아래에 아래를 넣는다:

```kotlin
            is Screen.Lesson -> Child.Lesson(
                LessonComponent(
                    componentContext = context,
                    sessionId = screen.sessionId,
                    onLeave = { navigation.pop() },
                )
            )
```

클래스 안의 `openWebView` 함수 근처에 아래 함수를 더한다:

```kotlin
    /**
     * 푸시 알림에서 수업으로 들어온다.
     * 이미 같은 수업 화면이 떠 있으면 다시 쌓지 않는다 — 알림을 두 번 눌러도 화면이 겹치면 안 된다.
     */
    fun openLesson(sessionId: String) {
        val active = stack.value.active.configuration
        if (active is Screen.Lesson && active.sessionId == sessionId) {
            AppLogger.d("RootComponent") { "Lesson $sessionId already active, skipping push" }
            return
        }
        navigation.push(Screen.Lesson(sessionId))
    }
```

import 에 한 줄을 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonComponent
```

`navigation.push` 가 아직 import 되어 있지 않으면 `import com.arkivanov.decompose.router.stack.push` 도 더한다.

- [ ] **Step 4: 화면을 만든다**

`composeApp/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/ui/lesson/LessonScreen.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.ui.lesson

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonComponent
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonIntent
import com.wjthinkbig.bookclub3app.ui.common.BackHandler
import com.wjthinkbig.bookclub3app.ui.theme.BookclubTheme

/**
 * 수업 화면 — 이번 단계에서는 껍데기다.
 * 영상 연결은 화상 모듈 스펙에서 이 자리에 들어온다.
 */
@Composable
fun LessonScreen(component: LessonComponent) {
    val uiState by component.uiState.collectAsState()

    BackHandler(enabled = true) { component.navigateBack() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BookclubTheme.colors.backgroundInverseSecondary),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(BookclubTheme.dimensions.spacing16),
        ) {
            Text(
                text = "수업에 들어왔어요",
                color = BookclubTheme.colors.textInversePrimary,
                style = BookclubTheme.typography.titlePrimary1,
            )
            Text(
                text = "연결 준비 중이에요 (${uiState.sessionId})",
                color = BookclubTheme.colors.textInversePrimary,
                style = BookclubTheme.typography.bodyPrimary1,
            )
            TextButton(onClick = { component.handleIntent(LessonIntent.Leave) }) {
                Text(
                    text = "나가기",
                    color = BookclubTheme.colors.textInversePrimary,
                    style = BookclubTheme.typography.bodyPrimary1,
                )
            }
        }
    }
}
```

`BookclubTheme.dimensions.spacing16` 과 `typography.titlePrimary1` 이 없다는 컴파일 오류가 나면 `ui/theme/BookclubDimensions.kt` 와 `BookclubTypography.kt` 에서 실제 존재하는 이름으로 바꾼다. 이 화면은 임시이므로 정확한 토큰 선택보다 컴파일이 우선이다.

- [ ] **Step 5: 렌더 분기를 더한다**

`composeApp/src/commonMain/.../App.kt` 의 `RootChildContent` 안, `is RootComponent.Child.WebView -> WebViewScreen(instance.component)` 아래에 한 줄을 더한다:

```kotlin
        is RootComponent.Child.Lesson -> LessonScreen(instance.component)
```

import 에 한 줄을 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.ui.lesson.LessonScreen
```

- [ ] **Step 6: 빌드를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:assembleBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/navigation shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/presentation composeApp/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/ui/lesson composeApp/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/App.kt
git commit -m "feat(lesson): give the child somewhere to land

A full-screen destination, following the Viewer and WebView precedent,
holding nothing yet but the session id. Pushing the same lesson twice is
ignored so a double-tapped notification cannot stack two rooms."
```

---

## Task 11: 호출 알림과 전체화면 액티비티

**Files:**
- Create: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonNotifications.kt`
- Create: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonCallActivity.kt`
- Modify: `composeApp/src/androidMain/AndroidManifest.xml`
- Modify: `composeApp/src/androidMain/.../MainActivity.kt`

**Interfaces:**
- Consumes: `RootComponent.openLesson` (Task 10)
- Produces: `LessonNotifications.showCall(context, sessionId, teacherName)`, `LessonCallActivity` (extras `session_id`, `teacher_name`), `MainActivity.ACTION_OPEN_LESSON`, `MainActivity.EXTRA_SESSION_ID`

- [ ] **Step 1: 알림을 만든다**

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonNotifications.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.lesson

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 수업 호출 알림.
 *
 * 전체화면 인텐트는 Android 14 부터 통화·알람 앱에만 기본 허용된다(설계 §6.7).
 * 거부되면 헤드업 알림으로 떨어지므로 contentIntent 를 항상 함께 걸고, 어느 쪽으로 뜨든
 * 같은 곳으로 가게 한다. 어느 경로로 떴는지는 로그로 남겨 나중에 오진하지 않게 한다.
 */
object LessonNotifications {

    private const val CHANNEL_ID = "lesson_call"
    private const val NOTIFICATION_ID = 4801
    private const val TAG = "LessonNotifications"

    fun showCall(context: Context, sessionId: String, teacherName: String) {
        ensureChannel(context)

        val callIntent = Intent(context, LessonCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra(LessonCallActivity.EXTRA_SESSION_ID, sessionId)
            putExtra(LessonCallActivity.EXTRA_TEACHER_NAME, teacherName)
        }
        val pending = PendingIntent.getActivity(
            context,
            sessionId.hashCode(),
            callIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle("수업 시작해요")
            .setContentText("${teacherName} 선생님이 기다리고 있어요")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(pending)
            .setFullScreenIntent(pending, true)
            .build()

        val manager = NotificationManagerCompat.from(context)
        val canFullScreen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        } else {
            true
        }
        android.util.Log.i(TAG, "showCall sessionId=$sessionId fullScreenAllowed=$canFullScreen")

        try {
            manager.notify(NOTIFICATION_ID, notification)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS 미허용. 조용히 삼키면 "안 왔다"와 구분되지 않는다.
            android.util.Log.w(TAG, "notify denied: ${e.message}")
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "수업 호출",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "선생님이 수업에 부를 때 알립니다"
            setShowBadge(true)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
```

- [ ] **Step 2: 호출 액티비티를 만든다**

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonCallActivity.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.lesson

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.wjthinkbig.bookclub3app.MainActivity

/**
 * 전화 오는 것처럼 화면을 점유하는 호출 화면.
 *
 * 별도 액티비티인 이유는 showWhenLocked / turnScreenOn 이 액티비티 속성이기 때문이다.
 * [들어가기] 는 MainActivity 를 OPEN_LESSON 으로 띄우고 자신은 끝낸다 — 기존 OPEN_VIEWER
 * 경로와 같은 구조다.
 */
class LessonCallActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        val sessionId = intent.getStringExtra(EXTRA_SESSION_ID).orEmpty()
        val teacherName = intent.getStringExtra(EXTRA_TEACHER_NAME).orEmpty()
        android.util.Log.i(TAG, "call screen shown sessionId=$sessionId")

        setContent {
            CallContent(
                teacherName = teacherName,
                onEnter = {
                    startActivity(
                        Intent(this, MainActivity::class.java).apply {
                            action = MainActivity.ACTION_OPEN_LESSON
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                            putExtra(MainActivity.EXTRA_SESSION_ID, sessionId)
                        }
                    )
                    finish()
                },
                onDismiss = { finish() },
            )
        }
    }

    companion object {
        private const val TAG = "LessonCallActivity"
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_TEACHER_NAME = "teacher_name"
    }
}

@Composable
private fun CallContent(
    teacherName: String,
    onEnter: () -> Unit,
    onDismiss: () -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(Color(0xFF101216)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            Text(text = "수업 시작해요", color = Color.White)
            Text(
                text = if (teacherName.isBlank()) "선생님이 기다리고 있어요"
                       else "${teacherName} 선생님이 기다리고 있어요",
                color = Color.White,
            )
            Button(onClick = onEnter) { Text("들어가기") }
            TextButton(onClick = onDismiss) { Text("나중에", color = Color.White) }
        }
    }
}
```

- [ ] **Step 3: 매니페스트에 등록한다**

`composeApp/src/androidMain/AndroidManifest.xml` 의 `MainActivity` 블록 안, `OPEN_VIEWER` 인텐트 필터 아래에 아래를 넣는다:

```xml
            <intent-filter>
                <action android:name="com.wjthinkbig.bookclub3app.action.OPEN_LESSON" />

                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
```

`WebViewActivity` 블록 아래, `</application>` 위에 아래를 넣는다:

```xml
        <!--
          잠금화면 위에 떠야 하므로 별도 액티비티다. exported=false — 외부 앱이 임의로
          아이 화면을 점유할 수 있으면 안 된다. 알림과 adb 는 같은 앱/셸 권한으로 띄운다.
        -->
        <activity
            android:name=".lesson.LessonCallActivity"
            android:exported="false"
            android:excludeFromRecents="true"
            android:launchMode="singleTask"
            android:showOnLockScreen="true"
            android:taskAffinity=".lesson"
            android:theme="@android:style/Theme.Material.NoActionBar.Fullscreen" />
```

- [ ] **Step 4: MainActivity 라우팅을 더한다**

`composeApp/src/androidMain/.../MainActivity.kt` 의 `companion object` 에 두 줄을 더한다:

```kotlin
        // 호출 알림에서 수업 화면으로 들어올 때 사용하는 Action 입니다.
        const val ACTION_OPEN_LESSON = "com.wjthinkbig.bookclub3app.action.OPEN_LESSON"
        const val EXTRA_SESSION_ID = "session_id"
```

같은 파일에 판별 함수를 더한다 (`isViewerLaunchIntent` 아래):

```kotlin
    /**
     * 수업 호출 진입 Intent 여부를 판별합니다.
     *
     * - Action: com.wjthinkbig.bookclub3app.action.OPEN_LESSON
     * - 필수 Extra: session_id
     */
    private fun Intent?.lessonSessionId(): String? {
        if (this == null) return null
        if (action != ACTION_OPEN_LESSON) return null
        return getStringExtra(EXTRA_SESSION_ID)?.takeIf { it.isNotBlank() }
    }
```

`initialScreen` 의 `when` 에 분기를 더한다. 아래로 교체한다:

```kotlin
            initialScreen = when {
                intent.isViewerLaunchIntent() ->
                    intent.parseViewerItems()
                        ?.let { Screen.Viewer(items = it) }
                        ?: Screen.Splash
                intent.isSearchLaunchIntent() -> Screen.Search
                // 수업 호출은 Splash 를 거친다 — bootstrap 없이는 아이 식별자가 없어
                // 수업 화면이 아무것도 부를 수 없다. Splash 이후 openLesson 으로 이어진다.
                else -> Screen.Splash
            },
```

`onCreate` 의 `setContent { App(rootComponent) }` 위에 아래를 넣는다:

```kotlin
        // cold start 로 호출 알림에서 들어온 경우. Splash 가 끝난 뒤에 밀어 넣는다.
        intent.lessonSessionId()?.let { pendingLessonSessionId = it }
```

클래스 필드에 한 줄을 더한다 (`private var rootComponent: RootComponent? = null` 아래):

```kotlin
    // Splash 가 끝나기 전에 push 하면 replaceCurrent(Main) 에 덮여 사라진다.
    private var pendingLessonSessionId: String? = null
```

`onNewIntent` 의 `when` 에 분기를 더한다 (`intent.isSearchLaunchIntent() -> ...` 아래):

```kotlin
            intent.lessonSessionId() != null -> {
                rootComponent?.openLesson(intent.lessonSessionId()!!)
            }
```

- [ ] **Step 5: cold start 대기분을 흘려보낸다**

`RootComponent` 의 Splash 완료 콜백에서 대기 중인 수업으로 이어가야 한다. `MainActivity` 의 `RootComponent(...)` 생성 인자에 아래를 더한다:

```kotlin
            onMainReady = {
                pendingLessonSessionId?.let { sessionId ->
                    pendingLessonSessionId = null
                    rootComponent?.openLesson(sessionId)
                }
            },
```

`RootComponent` 생성자에 매개변수를 더한다 (`onViewerResult` 아래):

```kotlin
    /**
     * Splash 가 끝나 Main 으로 전환된 직후 호출된다.
     * 푸시 cold start 에서 수업 화면을 밀어 넣는 지점이다 — Splash 전에 push 하면
     * replaceCurrent(Main) 에 덮여 사라진다.
     */
    private val onMainReady: () -> Unit = {},
```

`createChild` 의 Splash 분기에서 `onNavigateToMain` 을 아래로 교체한다:

```kotlin
                    onNavigateToMain = {
                        AppLogger.i("RootComponent") { "Splash completed, navigating to Main" }
                        navigation.replaceCurrent(Screen.Main)
                        onMainReady()
                    },
```

- [ ] **Step 6: 빌드하고 기기에 넣는다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:installBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`

- [ ] **Step 7: 호출 화면을 직접 띄워 확인한다**

FCM 없이 화면과 전환을 검증한다 (설계 §8.2).

```
adb shell am start -n com.wjthinkbig.bookclub3app.bookpad/com.wjthinkbig.bookclub3app.lesson.LessonCallActivity --es session_id test-session-1 --es teacher_name 김선생
```

Expected: 전체화면 호출 화면이 뜬다. [들어가기] 를 누르면 앱이 Splash 를 거쳐 "수업에 들어왔어요 / 연결 준비 중이에요 (test-session-1)" 화면으로 간다.

```
adb logcat -d -s LessonCallActivity:* LessonNotifications:*
```

Expected: `call screen shown sessionId=test-session-1`

- [ ] **Step 8: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson composeApp/src/androidMain/AndroidManifest.xml composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainActivity.kt shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/core/navigation/RootComponent.kt
git commit -m "feat(lesson): ring the tablet like a phone call

A child who misses a status-bar notification misses the lesson, so the
call takes the screen and can wake it. Android 14 may refuse that, and
the heads-up path has to work too - both intents point at the same place
and the log says which one the system chose.

Cold start waits for Splash: pushing the lesson before bootstrap means
replaceCurrent(Main) swallows it."
```

---

## Task 12: FCM 수신과 토큰 등록

**Files:**
- Create: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/DeviceTokenRegistrar.kt`
- Create: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonCallMessagingService.kt`
- Modify: `composeApp/src/androidMain/AndroidManifest.xml`
- Modify: `composeApp/src/androidMain/.../MainActivity.kt`

**Interfaces:**
- Consumes: `RegisterDeviceUseCase` (Task 9), `UserSessionManager` (기존), `LessonNotifications.showCall` (Task 11)
- Produces: `DeviceTokenRegistrar.register(customerNumber)`, `LessonCallMessagingService`

- [ ] **Step 1: 토큰 등록기를 만든다**

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/DeviceTokenRegistrar.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.lesson

import com.google.firebase.messaging.FirebaseMessaging
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.RegisterDeviceUseCase
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * FCM 토큰을 받아 스케줄링 백엔드에 등록한다.
 *
 * 실패를 화면에 띄우지 않는다 — 아이가 할 수 있는 일이 없고, 다음 실행에서 다시 시도된다.
 * 다만 조용히 넘기지도 않는다. 로그가 없으면 "부를 기기가 없다"의 원인을 추적할 수 없다.
 */
class DeviceTokenRegistrar(
    private val registerDevice: RegisterDeviceUseCase,
    private val appVersion: String?,
) {
    suspend fun register(customerNumber: String) {
        if (customerNumber.isBlank()) {
            android.util.Log.w(TAG, "skip register: blank customerNumber")
            return
        }
        val token = runCatching { currentToken() }.getOrElse { e ->
            android.util.Log.w(TAG, "token fetch failed: ${e.message}")
            return
        }
        registerDevice(customerNumber, token, PLATFORM_ANDROID, appVersion)
            .onSuccess { android.util.Log.i(TAG, "device registered customerNumber=$customerNumber") }
            .onFailure { android.util.Log.w(TAG, "device register failed: ${it.message}") }
    }

    private suspend fun currentToken(): String = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { cont.resume(it) }
            .addOnFailureListener { cont.resumeWithException(it) }
    }

    companion object {
        private const val TAG = "DeviceTokenRegistrar"
        const val PLATFORM_ANDROID = "android"
    }
}
```

- [ ] **Step 2: 수신 서비스를 만든다**

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson/LessonCallMessagingService.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.lesson

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.wjthinkbig.bookclub3app.core.user.manager.UserSessionManager
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.RegisterDeviceUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject

/**
 * 수업 호출 푸시 수신.
 *
 * data-only 메시지만 다룬다 — notification 필드가 있으면 앱이 백그라운드일 때 시스템이
 * 알림을 대신 만들어 버려 전체화면 인텐트를 걸 수 없다 (설계 §6.4).
 */
class LessonCallMessagingService : FirebaseMessagingService() {

    private val registerDeviceUseCase: RegisterDeviceUseCase by inject()
    private val sessionManager: UserSessionManager by inject()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val customerNumber = sessionManager.state.value.session?.childCustomerNumber.orEmpty()
        android.util.Log.i(TAG, "onNewToken customerNumber=$customerNumber")
        scope.launch {
            DeviceTokenRegistrar(registerDeviceUseCase, appVersionOrNull()).register(customerNumber)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        android.util.Log.i(TAG, "message received type=${data["type"]} sessionId=${data["sessionId"]}")

        if (data["type"] != TYPE_LESSON_CALL) return
        val sessionId = data["sessionId"]?.takeIf { it.isNotBlank() } ?: run {
            android.util.Log.w(TAG, "lesson_call without sessionId, ignored")
            return
        }
        LessonNotifications.showCall(
            context = applicationContext,
            sessionId = sessionId,
            teacherName = data["teacherName"].orEmpty(),
        )
    }

    private fun appVersionOrNull(): String? = runCatching {
        packageManager.getPackageInfo(packageName, 0).versionName
    }.getOrNull()

    companion object {
        private const val TAG = "LessonCallFcm"
        private const val TYPE_LESSON_CALL = "lesson_call"
    }
}
```

- [ ] **Step 3: 매니페스트에 서비스를 등록한다**

`composeApp/src/androidMain/AndroidManifest.xml` 의 `LessonCallActivity` 블록 아래, `</application>` 위에 아래를 넣는다:

```xml
        <!-- 이 앱의 첫 서비스 선언이다. -->
        <service
            android:name=".lesson.LessonCallMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
```

- [ ] **Step 4: 앱 시작 시 등록한다**

`composeApp/src/androidMain/.../MainActivity.kt` 의 import 에 아래를 더한다:

```kotlin
import androidx.lifecycle.lifecycleScope
import com.wjthinkbig.bookclub3app.core.user.manager.UserSessionManager
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.RegisterDeviceUseCase
import com.wjthinkbig.bookclub3app.lesson.DeviceTokenRegistrar
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
```

클래스 필드에 두 줄을 더한다:

```kotlin
    private val userSessionManager: UserSessionManager by inject()
    private val registerDeviceUseCase: RegisterDeviceUseCase by inject()
```

`onCreate` 의 `setContent { App(rootComponent) }` 아래에 아래를 넣는다:

```kotlin
        // bootstrap 이 끝나 childCustomerNumber 가 확정된 뒤에 등록한다.
        // 그 전에 보내면 기본 더미 회원번호로 기기가 등록된다.
        lifecycleScope.launch {
            val customerNumber = userSessionManager.state
                .map { it.session?.childCustomerNumber }
                .filterNotNull()
                .first()
            DeviceTokenRegistrar(
                registerDevice = registerDeviceUseCase,
                appVersion = runCatching {
                    packageManager.getPackageInfo(packageName, 0).versionName
                }.getOrNull(),
            ).register(customerNumber)
        }
```

import 에 `kotlinx.coroutines.flow.first` 를 더한다:

```kotlin
import kotlinx.coroutines.flow.first
```

- [ ] **Step 5: 알림 권한을 요청한다**

`MainActivity` 의 `micPermissionLauncher` 아래에 아래를 넣는다:

```kotlin
    // Android 13 부터 알림은 런타임 권한이다. 없으면 호출 알림이 통째로 사라진다.
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        android.util.Log.i("MainActivity", "POST_NOTIFICATIONS granted=$granted")
    }
```

`onCreate` 의 마이크 권한 요청 블록 아래에 아래를 넣는다:

```kotlin
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
```

import 에 한 줄을 더한다:

```kotlin
import android.os.Build
```

- [ ] **Step 6: 빌드하고 기기에 넣는다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:installBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`

`google-services.json` 이 없으면 `FirebaseMessaging.getInstance()` 가 런타임에 실패한다. 로그에 `token fetch failed:` 가 남고 앱은 계속 동작한다 — 의도한 동작이다.

- [ ] **Step 7: 등록 경로를 확인한다**

서버를 띄우고 기기에서 앱을 실행한다.

```
adb reverse tcp:3000 tcp:3000
adb shell am force-stop com.wjthinkbig.bookclub3app.bookpad
adb shell monkey -p com.wjthinkbig.bookclub3app.bookpad -c android.intent.category.LAUNCHER 1
adb logcat -d -s DeviceTokenRegistrar:* LessonCallFcm:*
```

Expected (google-services.json 이 있을 때): `device registered customerNumber=...`
Expected (없을 때): `token fetch failed: ...`

`ApiEndpoints.STUDYMEET` 이 `http://10.0.2.2:3000/` 이면 실기기에서는 닿지 않는다. `adb reverse` 를 쓰는 경우 `http://localhost:3000/` 으로 바꾸고 다시 빌드한다. 평문 HTTP 이므로 `res/xml/network_security_config.xml` 에 해당 호스트를 추가해야 한다:

```xml
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
```

- [ ] **Step 8: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet/app-bookclub3-master/app-bookclub3-master
git add composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/lesson composeApp/src/androidMain/AndroidManifest.xml composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainActivity.kt composeApp/src/androidMain/res/xml/network_security_config.xml
git commit -m "feat(lesson): register the tablet and answer the call

Registration waits for bootstrap; sending earlier files the device under
the dummy customer number, which looks like a working registration and
fails only later, as a child nobody can reach.

Every boundary logs: token fetch, registration, message arrival. Without
them 'the push never came' has four indistinguishable causes."
```

---

## Task 13: 끝에서 끝까지 확인

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1–12 전부

- [ ] **Step 1: 서버 테스트 전체를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm test && npm run build`
Expected: 모든 테스트 PASS, tsc 출력 없음

- [ ] **Step 2: 선생님 웹 테스트를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\teacher-web && npm test`
Expected: 모든 테스트 PASS

- [ ] **Step 3: 앱 테스트와 빌드를 돌린다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :shared:testDebugUnitTest :composeApp:assembleBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: 시드를 넣는다**

DB 에 학생 한 명의 `customerNumber` 를 기기의 값과 맞춘다. 기기 값은 로그로 확인한다:

```
adb logcat -d -s DeviceTokenRegistrar:*
```

`device registered customerNumber=<값>` 의 `<값>` 을 사용해 psql 또는 Prisma Studio 로 대상 학생을 갱신한다:

```sql
UPDATE "Student" SET "customerNumber" = '<값>' WHERE "id" = '<대상 학생 id>';
```

- [ ] **Step 5: 실제로 부른다**

선생님 웹 대기실에서 [아이 부르기] 를 누른다. 또는 직접 호출한다:

```
curl -X POST http://localhost:3000/sessions/<세션id>/nudge
```

Expected: `{"delivered":true,"reason":"SENT","sent":1,"failed":0}`

- [ ] **Step 6: 태블릿 동작을 기록한다**

설계 §8.3 의 네 항목을 각각 확인하고 결과를 적는다.

| 항목 | 확인 | 결과 |
|---|---|---|
| 전체화면 인텐트 허용 | `adb logcat -d -s LessonNotifications:*` 의 `fullScreenAllowed=` | |
| 화면 꺼짐에서 깨어남 | 화면 끄고 발송 | |
| 앱 종료 상태 도착 | `adb shell am force-stop ...` 후 발송 | |
| 절전 지연 | 방치 후 발송, 수신 시각 비교 | |

- [ ] **Step 7: 측정 결과를 설계 문서에 반영한다**

`docs/superpowers/specs/2026-08-11-lesson-call-push-design.md` §9 열린 이슈 3번(`USE_FULL_SCREEN_INTENT` 실제 허용 여부)을 측정 결과로 갱신한다. 허용되지 않았다면 그 사실과 헤드업 폴백이 동작했는지를 적는다.

- [ ] **Step 8: 커밋한다**

```bash
cd C:/Project/Android/StudyMeet
git add docs/superpowers/specs/2026-08-11-lesson-call-push-design.md
git commit -m "docs(lesson-call): record what the tablet actually did

The full-screen intent question was open by design; it is answered by
measurement, not by reading the policy."
```
