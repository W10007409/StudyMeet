# 수업 음성 통화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선생님과 아이가 서로의 목소리를 듣는다.

**Architecture:** WebRTC 를 `:studymeet` 안드로이드 라이브러리 모듈 하나에 가둔다. 공용 코드에는 플랫폼 타입이 없는 `LessonCallEngine` 인터페이스만 두고, 안드로이드 구현을 Koin 으로 꽂는다. 아이는 새 백엔드 엔드포인트로 자기 수업의 입장 정보를 받아 callee 로 붙고, 선생님 웹이 caller 로 offer 를 만든다.

**Tech Stack:** Kotlin 2.2.20 · Android Gradle Plugin 8.11.2 · `io.github.webrtc-sdk:android:144.7559.09` (`org.webrtc.*`) · OkHttp WebSocket · kotlinx-serialization · Koin 4 · Decompose 3 · Fastify 5 + Prisma 7 + Vitest 4

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-12-lesson-audio-call-design.md`. 충돌하면 설계가 이긴다.
- 스케줄링 백엔드: `C:\Project\Android\StudyMeet\scheduling`
- 북클럽 앱: `C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master`
- 두 저장소는 별도의 npm / Gradle 프로젝트다.
- **커밋하지 않는다.** 어떤 태스크도 git 명령을 실행하지 않는다. 작업은 작업 트리에 남긴다.
- **이번 범위는 음성뿐이다.** 카메라, 영상 트랙, 렌더러, PiP, 포그라운드 서비스, 재연결, 릴레이 비율 계측은 만들지 않는다.
- 역할은 **선생님이 caller, 아이가 callee** 다. 선생님 웹과 `GET /sessions/:id/token` 은 건드리지 않는다.
- 아이 식별자는 `childCustomerNumber` 다.
- WebRTC 는 `:studymeet` 밖으로 나가지 않는다. `:shared` 와 `composeApp/commonMain` 은 libwebrtc 를 모른다.
- 의존 방향: `composeApp/androidMain → :studymeet → :shared`. `:shared` 는 `:studymeet` 을 모른다.
- 코드 주석과 사용자 문구는 한국어. 이 앱에는 문자열 리소스 체계가 없다.
- 평문 WebSocket 은 `127.0.0.1` 표기로만 허용된다 (`network_security_config.xml`).
- 자격증명(TURN 비밀번호 등)은 `local.properties` / `.env` 에 두고 커밋하지 않는다.

---

## File Structure

### scheduling (백엔드)

| 경로 | 책임 | 상태 |
|---|---|---|
| `src/domain/currentSession.ts` | 후보 세션 목록에서 "지금 들어갈 수 있는 것" 고르기 (순수) | 신규 |
| `src/domain/currentSession.test.ts` | 위 규칙의 단위 테스트 | 신규 |
| `src/routes/student.ts` | `GET /students/:customerNumber/current-session` | 신규 |
| `src/server.ts` | `studentRoutes` 등록 | 수정 |

### :studymeet (신규 안드로이드 라이브러리 모듈)

| 경로 | 책임 | 상태 |
|---|---|---|
| `studymeet/build.gradle.kts` | 모듈 빌드 설정 | 신규 |
| `studymeet/src/main/AndroidManifest.xml` | 권한 선언 | 신규 |
| `.../studymeet/SignalingMessage.kt` | 시그널링 메시지 인코딩·파싱 (순수) | 신규 |
| `.../studymeet/IceCandidateBuffer.kt` | remote description 이전 후보 보관 규칙 (순수) | 신규 |
| `.../studymeet/SignalingClient.kt` | OkHttp WebSocket | 신규 |
| `.../studymeet/WebRtcAudioSession.kt` | PeerConnection 과 오디오 트랙 | 신규 |
| `.../studymeet/AndroidLessonCallEngine.kt` | 위 셋의 조립, 상태 생성 | 신규 |
| `studymeet/src/test/.../SignalingMessageTest.kt` | 코덱 테스트 | 신규 |
| `studymeet/src/test/.../IceCandidateBufferTest.kt` | 버퍼 테스트 | 신규 |

### 북클럽 앱 (기존 모듈)

| 경로 | 책임 | 상태 |
|---|---|---|
| `settings.gradle.kts` | `:studymeet` 포함 | 수정 |
| `gradle/libs.versions.toml` | webrtc-sdk, okhttp 별칭 | 수정 |
| `shared/.../feature/lesson/domain/call/LessonCallEngine.kt` | 공용 계약 + 상태 + 실패 사유 | 신규 |
| `shared/.../feature/lesson/domain/call/NoopLessonCallEngine.kt` | iOS 용 빈 구현 | 신규 |
| `shared/.../feature/lesson/data/remote/api/LessonApi.kt` | `current-session` 추가 | 수정 |
| `shared/.../feature/lesson/data/remote/dto/JoinInfoDto.kt` | 입장 정보 DTO | 신규 |
| `shared/.../feature/lesson/domain/model/JoinInfo.kt` | 입장 정보 도메인 모델 | 신규 |
| `shared/.../feature/lesson/domain/model/LessonEntry.kt` | **삭제** | 삭제 |
| `shared/.../feature/lesson/domain/repository/LessonRepository.kt` | `getJoinInfo` 추가 | 수정 |
| `shared/.../feature/lesson/data/repository/LessonRepositoryImpl.kt` | 위 구현 | 수정 |
| `shared/.../feature/lesson/domain/usecase/GetJoinInfoUseCase.kt` | 입장 정보 조회 | 신규 |
| `shared/.../feature/lesson/di/LessonModule.kt` | 새 UseCase 등록 | 수정 |
| `shared/.../feature/lesson/presentation/viewmodel/LessonUiState.kt` | 통화 상태 반영 | 수정 |
| `shared/.../feature/lesson/presentation/viewmodel/LessonIntent.kt` | 재시도·마이크 토글 | 수정 |
| `shared/.../feature/lesson/presentation/viewmodel/LessonComponent.kt` | 조회 → 통화 시작, 상태 구독 | 수정 |
| `shared/.../core/navigation/RootComponent.kt` | Lesson 자식에 의존성 주입, `openLesson` 인자 변경 | 수정 |
| `composeApp/.../ui/lesson/LessonScreen.kt` | 상태별 화면과 재시도 | 수정 |
| `composeApp/.../ui/krs/…` | KRS 버튼이 세션 id 없이 진입 | 수정 |
| `composeApp/src/androidMain/.../MainApplication.kt` | 안드로이드 엔진 바인딩 | 수정 |
| `composeApp/src/iosMain/.../KoinHelper.kt` | Noop 엔진 바인딩 | 수정 |
| `composeApp/build.gradle.kts` | `:studymeet` 의존 | 수정 |
| `composeApp/src/androidMain/.../MainActivity.kt` | 마이크 권한 결과 노출 | 수정 |

---

## Task 1: 지금 들어갈 수 있는 수업 고르기

이 저장소는 라우트를 테스트하지 않고 `src/domain/*.ts` 만 테스트한다. 선택 규칙을 라우트에 두면 아무도 검증하지 않는다.

**Files:**
- Create: `scheduling/src/domain/currentSession.ts`
- Test: `scheduling/src/domain/currentSession.test.ts`

**Interfaces:**
- Consumes: `LOBBY_WINDOW_MS` (기존 `src/routes/teacher.ts` 가 같은 값을 쓰지만, 이 모듈은 자체 상수를 갖는다 — 도메인이 라우트를 import 하지 않는다)
- Produces: `CURRENT_SESSION_WINDOW_MS`, `SessionCandidate`, `pickCurrentSession(candidates, now): SessionCandidate | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`scheduling/src/domain/currentSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CURRENT_SESSION_WINDOW_MS, pickCurrentSession } from './currentSession'

const now = new Date('2026-08-12T11:00:00+09:00')

function at(iso: string, status: string, id = 's1') {
  return { id, scheduledAt: new Date(iso), status }
}

describe('pickCurrentSession', () => {
  it('시작 5분 전이면 들어갈 수 있다', () => {
    const s = at('2026-08-12T11:05:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('시작 6분 전이면 아직 아니다 — 대기실이 열리지 않았다', () => {
    const s = at('2026-08-12T11:06:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)).toBeNull()
  })

  it('이미 시작한 수업에는 들어갈 수 있다', () => {
    const s = at('2026-08-12T10:50:00+09:00', 'IN_PROGRESS')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('지난 시각의 SCHEDULED 도 들어갈 수 있다 — 아이가 늦은 경우다', () => {
    const s = at('2026-08-12T10:55:00+09:00', 'SCHEDULED')
    expect(pickCurrentSession([s], now)?.id).toBe('s1')
  })

  it('끝난 수업에는 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'ENDED')], now)).toBeNull()
  })

  it('취소된 수업에는 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'CANCELLED')], now)).toBeNull()
  })

  it('노쇼 처리된 수업에도 들여보내지 않는다', () => {
    expect(pickCurrentSession([at('2026-08-12T10:50:00+09:00', 'NO_SHOW')], now)).toBeNull()
  })

  it('여러 개면 가장 이른 것을 고른다', () => {
    const later = at('2026-08-12T11:04:00+09:00', 'SCHEDULED', 'late')
    const earlier = at('2026-08-12T10:58:00+09:00', 'SCHEDULED', 'early')
    expect(pickCurrentSession([later, earlier], now)?.id).toBe('early')
  })

  it('후보가 없으면 null 이다', () => {
    expect(pickCurrentSession([], now)).toBeNull()
  })

  it('대기실 창은 5분이다', () => {
    expect(CURRENT_SESSION_WINDOW_MS).toBe(5 * 60 * 1000)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/domain/currentSession.test.ts`
Expected: FAIL — `./currentSession` 을 찾지 못한다

- [ ] **Step 3: 구현한다**

`scheduling/src/domain/currentSession.ts`:

```ts
/**
 * 아이가 "지금" 들어갈 수 있는 수업을 고른다.
 *
 * 선생님 화면의 대기실 창과 같은 5분을 쓴다. 두 화면이 서로 다른 시각에 열리면
 * 선생님은 기다리는데 아이는 들어갈 수 없는 구간이 생긴다.
 */
export const CURRENT_SESSION_WINDOW_MS = 5 * 60 * 1000

export interface SessionCandidate {
  id: string
  scheduledAt: Date
  status: string
}

/**
 * 들어갈 수 있는 상태. 끝났거나 취소된 수업에는 아이를 들여보내지 않는다.
 * 편성 설계의 "ENDED +30분 재입장"은 선생님이 메모를 마저 쓰기 위한 규칙이며
 * 아이에게 적용되지 않는다.
 */
const JOINABLE_STATUSES = ['SCHEDULED', 'LOBBY_OPEN', 'IN_PROGRESS']

export function pickCurrentSession(
  candidates: SessionCandidate[],
  now: Date,
): SessionCandidate | null {
  const opensBy = now.getTime() + CURRENT_SESSION_WINDOW_MS

  const joinable = candidates
    .filter((c) => JOINABLE_STATUSES.includes(c.status))
    // 시작 5분 전부터 들어갈 수 있다. 지난 시각은 늦게 들어오는 경우이므로 막지 않는다.
    .filter((c) => c.scheduledAt.getTime() <= opensBy)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())

  return joinable[0] ?? null
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npx vitest run src/domain/currentSession.test.ts`
Expected: PASS — 10 tests

---

## Task 2: 입장 정보 엔드포인트

**Files:**
- Create: `scheduling/src/routes/student.ts`
- Modify: `scheduling/src/server.ts`

**Interfaces:**
- Consumes: `pickCurrentSession`, `SessionCandidate` (Task 1)
- Produces: `studentRoutes` (FastifyPluginAsync<{prisma}>), `GET /students/:customerNumber/current-session`

응답 형태:

```json
{
  "sessionId": "sess-...",
  "signalingUrl": "ws://127.0.0.1:8081",
  "room": "sess-...",
  "role": "callee",
  "teacherName": "김선생",
  "scheduledAt": "2026-08-12T11:11:03+09:00"
}
```

- [ ] **Step 1: 라우트를 구현한다**

`scheduling/src/routes/student.ts`:

```ts
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { pickCurrentSession, type SessionCandidate } from '../domain/currentSession.js'

interface Deps {
  prisma: PrismaClient
}

async function sendNotFound(reply: FastifyReply): Promise<void> {
  // 남의 방이 존재한다는 사실조차 알려주지 않는다. 없는 것과 같은 응답을 준다.
  await reply.code(404).send({ error: '들어갈 수 있는 수업이 없다' })
}

export const studentRoutes: FastifyPluginAsync<Deps> = async (app, { prisma }) => {
  // 인증이 없다. 회원번호만 알면 그 아이의 수업 정보가 나온다 — 설계 §7-1 의 열린 이슈다.
  app.get<{ Params: { customerNumber: string }; Querystring: { sessionId?: string } }>(
    '/students/:customerNumber/current-session',
    async (request, reply) => {
      const { customerNumber } = request.params
      const { sessionId } = request.query

      const student = await prisma.student.findUnique({ where: { customerNumber } })
      if (!student) return sendNotFound(reply)

      // 소유권 확인은 이 where 절이 한다 — 다른 아이의 세션은 애초에 후보에 들어오지 않는다.
      const sessions = await prisma.session.findMany({
        where: {
          enrollment: { studentId: student.id },
          ...(sessionId ? { id: sessionId } : {}),
        },
        include: { teacher: true },
      })

      const candidates: SessionCandidate[] = sessions.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        status: s.status,
      }))

      const picked = pickCurrentSession(candidates, new Date())
      if (!picked) return sendNotFound(reply)

      const session = sessions.find((s) => s.id === picked.id)!

      return {
        sessionId: session.id,
        signalingUrl: process.env.SIGNALING_URL ?? 'ws://127.0.0.1:8081',
        room: session.id,
        // 선생님이 caller 다. 아이는 offer 를 기다린다 (설계 §3.1).
        role: 'callee' as const,
        teacherName: session.teacher.name,
        scheduledAt: session.scheduledAt.toISOString(),
      }
    },
  )
}
```

- [ ] **Step 2: 서버에 등록한다**

`scheduling/src/server.ts` 의 import 목록에 한 줄을 더한다:

```ts
import { studentRoutes } from './routes/student.js'
```

`app.register(deviceRoutes, { prisma })` 아래에 한 줄을 더한다:

```ts
app.register(studentRoutes, { prisma })
```

- [ ] **Step 3: 타입 검사와 전체 테스트**

Run: `cd C:\Project\Android\StudyMeet\scheduling && npm run build && npm test`
Expected: tsc 출력 없음, 모든 테스트 PASS

- [ ] **Step 4: 살아 있는 서버로 확인한다**

Postgres 컨테이너 `studymeet-pg` 가 떠 있고 시드 데이터(`s-seed-1`, 회원번호 `MC1A000000`, 세션 `sess-seed-1`)가 들어 있어야 한다. 없으면 이 단계를 건너뛰고 보고서에 적는다.

```
npm run dev
curl -s "http://127.0.0.1:3000/students/MC1A000000/current-session"
```

Expected: `{"sessionId":"sess-seed-1", ... "role":"callee", ...}`

```
curl -s -o NUL -w "%{http_code}\n" "http://127.0.0.1:3000/students/NOPE/current-session"
```

Expected: `404`

---

## Task 3: 공용 계약과 빈 구현

`:studymeet` 이 구현할 인터페이스를 먼저 만든다. 이것이 있어야 모듈이 컴파일된다.

**Files:**
- Create: `app-bookclub3-master/app-bookclub3-master/shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/domain/call/LessonCallEngine.kt`
- Create: `.../feature/lesson/domain/call/NoopLessonCallEngine.kt`
- Modify: `composeApp/src/iosMain/kotlin/com/wjthinkbig/bookclub3app/KoinHelper.kt`
- Modify: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainApplication.kt`

**Interfaces:**
- Consumes: 없음
- Produces: `LessonCallEngine`, `LessonCallState`, `CallFailure`, `NoopLessonCallEngine`

- [ ] **Step 1: 계약을 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/domain/call/LessonCallEngine.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.call

import kotlinx.coroutines.flow.StateFlow

/**
 * 수업 통화 엔진.
 *
 * 플랫폼 타입이 하나도 없다. 이 계약이 있어야 :shared 가 libwebrtc 를 모른 채로
 * 통화를 다룰 수 있고, iOS 빌드도 깨지지 않는다.
 */
interface LessonCallEngine {
    val state: StateFlow<LessonCallState>

    /**
     * 방에 들어간다.
     * @param isCaller offer 를 만드는 쪽인지. 아이는 항상 false 다 (설계 §3.1).
     */
    fun join(signalingUrl: String, room: String, isCaller: Boolean)

    fun setMicEnabled(enabled: Boolean)

    fun leave()
}

sealed class LessonCallState {
    data object Idle : LessonCallState()
    data object Connecting : LessonCallState()
    data object Connected : LessonCallState()
    data class Failed(val reason: CallFailure) : LessonCallState()
}

/**
 * 실패를 하나로 뭉치지 않는다. 아이가 할 수 있는 일이 사유마다 다르다 —
 * 권한은 다시 허용하면 되고, 연결 실패는 다시 시도하는 것뿐이다.
 */
enum class CallFailure {
    NO_MIC_PERMISSION,
    SIGNALING_UNREACHABLE,
    ICE_FAILED,
    ENGINE_ERROR,
}
```

- [ ] **Step 2: 빈 구현을 만든다**

`shared/src/commonMain/kotlin/com/wjthinkbig/bookclub3app/feature/lesson/domain/call/NoopLessonCallEngine.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.call

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 통화를 지원하지 않는 플랫폼용. 지금은 iOS 가 쓴다.
 *
 * 조용히 성공한 척하지 않는다 — join 하면 즉시 ENGINE_ERROR 로 떨어져서
 * 화면이 "문제가 생겼어요"를 보여준다. 아무 일도 일어나지 않는 것보다 낫다.
 */
class NoopLessonCallEngine : LessonCallEngine {

    private val _state = MutableStateFlow<LessonCallState>(LessonCallState.Idle)
    override val state: StateFlow<LessonCallState> = _state.asStateFlow()

    override fun join(signalingUrl: String, room: String, isCaller: Boolean) {
        _state.value = LessonCallState.Failed(CallFailure.ENGINE_ERROR)
    }

    override fun setMicEnabled(enabled: Boolean) = Unit

    override fun leave() {
        _state.value = LessonCallState.Idle
    }
}
```

- [ ] **Step 3: 양쪽 플랫폼에 바인딩한다**

`composeApp/src/iosMain/kotlin/com/wjthinkbig/bookclub3app/KoinHelper.kt` 의 `modules(...)` 목록에서 `lessonModule,` 아래에 한 줄을 더한다:

```kotlin
                iosLessonCallModule,
```

같은 파일 맨 아래(클래스 밖)에 모듈을 정의하고, 필요한 import 를 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallEngine
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.NoopLessonCallEngine
import org.koin.dsl.module

/** iOS 는 통화를 지원하지 않는다. 자리만 채운다. */
private val iosLessonCallModule = module {
    single<LessonCallEngine> { NoopLessonCallEngine() }
}
```

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainApplication.kt` 에도 지금은 같은 빈 구현을 바인딩한다. Task 7 에서 진짜 구현으로 바꾼다. `modules(...)` 의 `lessonModule,` 아래에 한 줄:

```kotlin
                androidLessonCallModule,
```

파일 맨 아래에:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallEngine
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.NoopLessonCallEngine
import org.koin.dsl.module

// Task 7 에서 AndroidLessonCallEngine 으로 교체한다.
private val androidLessonCallModule = module {
    single<LessonCallEngine> { NoopLessonCallEngine() }
}
```

- [ ] **Step 4: 컴파일한다**

Run: `cd C:\Project\Android\StudyMeet\app-bookclub3-master\app-bookclub3-master && .\gradlew.bat :composeApp:compileBookpadDebugKotlinAndroid --console=plain`
Expected: `BUILD SUCCESSFUL`

---

## Task 4: `:studymeet` 모듈 골격

**Files:**
- Modify: `settings.gradle.kts`
- Modify: `gradle/libs.versions.toml`
- Create: `studymeet/build.gradle.kts`
- Create: `studymeet/src/main/AndroidManifest.xml`
- Modify: `composeApp/build.gradle.kts`

**Interfaces:**
- Consumes: `:shared` (LessonCallEngine)
- Produces: Gradle 모듈 `:studymeet`

- [ ] **Step 1: 버전 카탈로그에 추가한다**

`gradle/libs.versions.toml` 의 `[versions]` 에 두 줄:

```toml
webrtc = "144.7559.09"
okhttp = "4.12.0"
```

`[libraries]` 에 두 줄:

```toml
webrtc-android = { module = "io.github.webrtc-sdk:android", version.ref = "webrtc" }
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
```

- [ ] **Step 2: 모듈을 포함시킨다**

`settings.gradle.kts` 의 `include(":shared")` 아래에 한 줄:

```kotlin
include(":studymeet")
```

- [ ] **Step 3: 모듈 빌드 파일을 만든다**

`studymeet/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.kotlinSerialization)
}

android {
    namespace = "com.wjthinkbig.studymeet"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}

dependencies {
    // 통화 계약. :shared 는 반대로 이 모듈을 모른다.
    implementation(projects.shared)

    implementation(libs.webrtc.android)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.kotlin.test)
}
```

`libs.plugins.kotlinAndroid` 가 카탈로그에 없으면 `[plugins]` 에 아래를 더한다:

```toml
kotlinAndroid = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
```

그리고 루트 `build.gradle.kts` 의 `plugins` 블록에:

```kotlin
    alias(libs.plugins.kotlinAndroid) apply false
```

- [ ] **Step 4: 매니페스트를 만든다**

`studymeet/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
  이 모듈이 필요로 하는 권한만 선언한다. 앱 매니페스트에 이미 같은 것이 있어도
  모듈이 스스로 요구를 밝히는 편이, 나중에 다른 앱이 이 모듈을 쓸 때 안전하다.
-->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
</manifest>
```

- [ ] **Step 5: 앱이 모듈을 쓰게 한다**

`composeApp/build.gradle.kts` 의 `androidMain.dependencies` 블록 끝에 한 줄:

```kotlin
            implementation(projects.studymeet)
```

- [ ] **Step 6: 컴파일한다**

Run: `.\gradlew.bat :studymeet:assembleDebug :composeApp:compileBookpadDebugKotlinAndroid --console=plain`
Expected: `BUILD SUCCESSFUL`

`webrtc-sdk` 가 해결되지 않으면 저장소 설정 문제다. `settings.gradle.kts` 의 `dependencyResolutionManagement` 는 `google()` 에 그룹 필터를 걸고 `mavenCentral()` 을 열어 두었다. `io.github.webrtc-sdk` 는 Maven Central 에 있으므로 그대로 해결되어야 한다. 실패하면 정확한 오류를 보고서에 적는다.

---

## Task 5: 시그널링 메시지 코덱과 ICE 후보 버퍼

플랫폼에 닿지 않는 두 조각이다. JVM 단위 테스트로 검증한다.

**Files:**
- Create: `studymeet/src/main/java/com/wjthinkbig/studymeet/SignalingMessage.kt`
- Create: `studymeet/src/main/java/com/wjthinkbig/studymeet/IceCandidateBuffer.kt`
- Test: `studymeet/src/test/java/com/wjthinkbig/studymeet/SignalingMessageTest.kt`
- Test: `studymeet/src/test/java/com/wjthinkbig/studymeet/IceCandidateBufferTest.kt`

**Interfaces:**
- Consumes: 없음
- Produces: `SignalingMessage` (sealed), `encodeSignalingMessage(msg): String`, `parseSignalingMessage(text): SignalingMessage?`, `IceCandidateBuffer<T>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`studymeet/src/test/java/com/wjthinkbig/studymeet/SignalingMessageTest.kt`:

```kotlin
package com.wjthinkbig.studymeet

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SignalingMessageTest {

    @Test
    fun `서버가 보내는 ready 를 읽는다`() {
        assertTrue(parseSignalingMessage("""{"type":"ready"}""") is SignalingMessage.Ready)
    }

    @Test
    fun `상대가 나갔다는 신호를 읽는다`() {
        assertTrue(parseSignalingMessage("""{"type":"peer-left"}""") is SignalingMessage.PeerLeft)
    }

    @Test
    fun `offer 의 sdp 를 읽는다`() {
        val msg = parseSignalingMessage("""{"type":"offer","sdp":"v=0 fake"}""")
        assertEquals("v=0 fake", (msg as SignalingMessage.Offer).sdp)
    }

    @Test
    fun `answer 의 sdp 를 읽는다`() {
        val msg = parseSignalingMessage("""{"type":"answer","sdp":"v=0 fake"}""")
        assertEquals("v=0 fake", (msg as SignalingMessage.Answer).sdp)
    }

    @Test
    fun `candidate 의 세 필드를 읽는다`() {
        val text = """{"type":"candidate","candidate":"cand","sdpMid":"0","sdpMLineIndex":1}"""
        val msg = parseSignalingMessage(text) as SignalingMessage.Candidate
        assertEquals("cand", msg.candidate)
        assertEquals("0", msg.sdpMid)
        assertEquals(1, msg.sdpMLineIndex)
    }

    @Test
    fun `모르는 타입은 무시한다 - 서버가 늘어나도 앱이 죽지 않는다`() {
        assertNull(parseSignalingMessage("""{"type":"something-new"}"""))
    }

    @Test
    fun `type 이 없으면 무시한다`() {
        assertNull(parseSignalingMessage("""{"sdp":"v=0"}"""))
    }

    @Test
    fun `JSON 이 아니면 무시한다 - 예외를 밖으로 던지지 않는다`() {
        assertNull(parseSignalingMessage("not json at all"))
    }

    @Test
    fun `offer 를 보낼 때 type 과 sdp 를 담는다`() {
        val text = encodeSignalingMessage(SignalingMessage.Offer("v=0 fake"))
        assertEquals(SignalingMessage.Offer("v=0 fake"), parseSignalingMessage(text))
    }

    @Test
    fun `answer 를 왕복시켜도 값이 유지된다`() {
        val original = SignalingMessage.Answer("v=0 answer")
        assertEquals(original, parseSignalingMessage(encodeSignalingMessage(original)))
    }

    @Test
    fun `candidate 를 왕복시켜도 값이 유지된다`() {
        val original = SignalingMessage.Candidate("cand", "audio", 0)
        assertEquals(original, parseSignalingMessage(encodeSignalingMessage(original)))
    }
}
```

`studymeet/src/test/java/com/wjthinkbig/studymeet/IceCandidateBufferTest.kt`:

```kotlin
package com.wjthinkbig.studymeet

import kotlin.test.Test
import kotlin.test.assertEquals

class IceCandidateBufferTest {

    @Test
    fun `remote description 전에 온 후보는 바로 넣지 않는다`() {
        val buffer = IceCandidateBuffer<String>()
        assertEquals(emptyList(), buffer.addOrBuffer("c1"))
    }

    @Test
    fun `remote description 이 오면 모아둔 것을 순서대로 흘려보낸다`() {
        val buffer = IceCandidateBuffer<String>()
        buffer.addOrBuffer("c1")
        buffer.addOrBuffer("c2")
        assertEquals(listOf("c1", "c2"), buffer.onRemoteDescriptionSet())
    }

    @Test
    fun `remote description 이후에 온 후보는 바로 넣는다`() {
        val buffer = IceCandidateBuffer<String>()
        buffer.onRemoteDescriptionSet()
        assertEquals(listOf("c3"), buffer.addOrBuffer("c3"))
    }

    @Test
    fun `흘려보낸 뒤에는 남아 있지 않다 - 두 번 넣으면 중복 후보가 된다`() {
        val buffer = IceCandidateBuffer<String>()
        buffer.addOrBuffer("c1")
        buffer.onRemoteDescriptionSet()
        assertEquals(emptyList(), buffer.onRemoteDescriptionSet())
    }

    @Test
    fun `clear 하면 모아둔 것과 상태가 모두 사라진다`() {
        val buffer = IceCandidateBuffer<String>()
        buffer.addOrBuffer("c1")
        buffer.onRemoteDescriptionSet()
        buffer.clear()
        assertEquals(emptyList(), buffer.addOrBuffer("c2"))
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `.\gradlew.bat :studymeet:testDebugUnitTest --console=plain`
Expected: FAIL — `Unresolved reference: parseSignalingMessage`

- [ ] **Step 3: 코덱을 구현한다**

`studymeet/src/main/java/com/wjthinkbig/studymeet/SignalingMessage.kt`:

```kotlin
package com.wjthinkbig.studymeet

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive

/**
 * 시그널링 서버와 주고받는 메시지.
 *
 * 서버는 ready 와 peer-left 만 스스로 만들고, 나머지는 상대가 보낸 것을 그대로 중계한다.
 */
sealed interface SignalingMessage {
    data object Ready : SignalingMessage
    data object PeerLeft : SignalingMessage
    data class Offer(val sdp: String) : SignalingMessage
    data class Answer(val sdp: String) : SignalingMessage
    data class Candidate(
        val candidate: String,
        val sdpMid: String,
        val sdpMLineIndex: Int,
    ) : SignalingMessage
}

private val json = Json { ignoreUnknownKeys = true }

fun encodeSignalingMessage(message: SignalingMessage): String {
    val obj = when (message) {
        is SignalingMessage.Ready -> buildJsonObject { put("type", JsonPrimitive("ready")) }
        is SignalingMessage.PeerLeft -> buildJsonObject { put("type", JsonPrimitive("peer-left")) }
        is SignalingMessage.Offer -> buildJsonObject {
            put("type", JsonPrimitive("offer"))
            put("sdp", JsonPrimitive(message.sdp))
        }
        is SignalingMessage.Answer -> buildJsonObject {
            put("type", JsonPrimitive("answer"))
            put("sdp", JsonPrimitive(message.sdp))
        }
        is SignalingMessage.Candidate -> buildJsonObject {
            put("type", JsonPrimitive("candidate"))
            put("candidate", JsonPrimitive(message.candidate))
            put("sdpMid", JsonPrimitive(message.sdpMid))
            put("sdpMLineIndex", JsonPrimitive(message.sdpMLineIndex))
        }
    }
    return obj.toString()
}

/**
 * 읽을 수 없는 것은 null 이다. 예외를 밖으로 던지지 않는다 —
 * 서버가 메시지 종류를 늘렸다고 아이의 수업이 끊겨서는 안 된다.
 */
fun parseSignalingMessage(text: String): SignalingMessage? {
    val obj = runCatching { json.parseToJsonElement(text) as? JsonObject }.getOrNull() ?: return null
    val type = runCatching { obj["type"]?.jsonPrimitive?.content }.getOrNull() ?: return null

    return runCatching {
        when (type) {
            "ready" -> SignalingMessage.Ready
            "peer-left" -> SignalingMessage.PeerLeft
            "offer" -> SignalingMessage.Offer(obj.getValue("sdp").jsonPrimitive.content)
            "answer" -> SignalingMessage.Answer(obj.getValue("sdp").jsonPrimitive.content)
            "candidate" -> SignalingMessage.Candidate(
                candidate = obj.getValue("candidate").jsonPrimitive.content,
                sdpMid = obj.getValue("sdpMid").jsonPrimitive.content,
                sdpMLineIndex = obj.getValue("sdpMLineIndex").jsonPrimitive.int,
            )
            else -> null
        }
    }.getOrNull()
}
```

- [ ] **Step 4: 버퍼를 구현한다**

`studymeet/src/main/java/com/wjthinkbig/studymeet/IceCandidateBuffer.kt`:

```kotlin
package com.wjthinkbig.studymeet

/**
 * remote description 이 적용되기 전에 도착한 ICE 후보를 모아 둔다.
 *
 * Phase 0 에서 이 규칙이 없어 후보가 조용히 버려진 적이 있다. 후보가 사라지면
 * 연결은 "그냥 안 되는" 상태가 되고, 오류가 없어서 원인을 찾기 어렵다.
 *
 * 타입 매개변수를 둔 것은 libwebrtc 없이 단위 테스트하기 위해서다.
 */
class IceCandidateBuffer<T> {

    private val pending = mutableListOf<T>()
    private var remoteDescriptionSet = false

    /** 지금 넣어도 되는 후보들을 돌려준다. 아직이면 빈 목록이고 안에 모아 둔다. */
    fun addOrBuffer(candidate: T): List<T> {
        if (remoteDescriptionSet) return listOf(candidate)
        pending.add(candidate)
        return emptyList()
    }

    /** 모아 둔 후보를 도착 순서대로 돌려주고 비운다. */
    fun onRemoteDescriptionSet(): List<T> {
        remoteDescriptionSet = true
        val drained = pending.toList()
        pending.clear()
        return drained
    }

    fun clear() {
        pending.clear()
        remoteDescriptionSet = false
    }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `.\gradlew.bat :studymeet:testDebugUnitTest --console=plain`
Expected: `BUILD SUCCESSFUL` — 16 tests

---

## Task 6: 시그널링 클라이언트와 오디오 세션

**Files:**
- Create: `studymeet/src/main/java/com/wjthinkbig/studymeet/SignalingClient.kt`
- Create: `studymeet/src/main/java/com/wjthinkbig/studymeet/WebRtcAudioSession.kt`

**Interfaces:**
- Consumes: `SignalingMessage`, `encodeSignalingMessage`, `parseSignalingMessage`, `IceCandidateBuffer` (Task 5)
- Produces: `SignalingClient(url, listener)` with `connect()`, `send(SignalingMessage)`, `close()`; `SignalingClient.Listener`; `WebRtcAudioSession(context, listener)` with `start()`, `createOffer()`, `handleRemoteOffer(sdp)`, `handleRemoteAnswer(sdp)`, `handleRemoteCandidate(...)`, `setMicEnabled(Boolean)`, `close()`; `WebRtcAudioSession.Listener`

- [ ] **Step 1: 시그널링 클라이언트를 만든다**

`studymeet/src/main/java/com/wjthinkbig/studymeet/SignalingClient.kt`:

```kotlin
package com.wjthinkbig.studymeet

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/**
 * 시그널링 서버 접속.
 *
 * 서버는 같은 room 의 두 참가자 사이에서 메시지를 그대로 중계한다.
 * 스스로 만들어 보내는 것은 ready 와 peer-left 둘뿐이다.
 */
class SignalingClient(
    private val url: String,
    private val listener: Listener,
) {
    interface Listener {
        fun onReady()
        fun onMessage(message: SignalingMessage)
        fun onPeerLeft()
        fun onFailure(error: Throwable)
    }

    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    fun connect() {
        socket = client.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val message = parseSignalingMessage(text)
                    if (message == null) {
                        Log.w(TAG, "unreadable signaling message ignored")
                        return
                    }
                    when (message) {
                        is SignalingMessage.Ready -> listener.onReady()
                        is SignalingMessage.PeerLeft -> listener.onPeerLeft()
                        else -> listener.onMessage(message)
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    // 조용히 삼키면 화면이 영영 "연결 중"에 머문다.
                    Log.w(TAG, "signaling failure: ${t.message}")
                    listener.onFailure(t)
                }
            },
        )
    }

    fun send(message: SignalingMessage) {
        socket?.send(encodeSignalingMessage(message))
    }

    fun close() {
        socket?.close(1000, null)
        socket = null
    }

    private companion object {
        const val TAG = "SignalingClient"
    }
}
```

- [ ] **Step 2: 오디오 세션을 만든다**

`studymeet/src/main/java/com/wjthinkbig/studymeet/WebRtcAudioSession.kt`:

```kotlin
package com.wjthinkbig.studymeet

import android.content.Context
import android.util.Log
import org.webrtc.AudioTrack
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

/**
 * 오디오 전용 PeerConnection.
 *
 * 카메라도 렌더러도 없다 — 이번 범위는 소리뿐이다 (설계 §1).
 * 영상 트랙은 이 PeerConnection 위에 나중에 얹는다.
 */
class WebRtcAudioSession(
    private val context: Context,
    private val listener: Listener,
) {
    interface Listener {
        fun onLocalDescription(message: SignalingMessage)
        fun onLocalCandidate(message: SignalingMessage.Candidate)
        fun onConnected()
        fun onFailed()
    }

    private val eglBase: EglBase = EglBase.create()
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private val candidateBuffer = IceCandidateBuffer<IceCandidate>()

    fun start() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions()
        )
        val pcFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
        factory = pcFactory

        val iceServers = buildList {
            add(PeerConnection.IceServer.builder(STUN_URL).createIceServer())
            // TURN 은 빌드 타임 선택이다. 없으면 STUN 만으로 붙고, 서로 다른 망이면
            // 반드시 실패한다 (설계 §5.1).
            if (BuildConfig.TURN_URL.isNotBlank()) {
                add(
                    PeerConnection.IceServer.builder(BuildConfig.TURN_URL)
                        .setUsername(BuildConfig.TURN_USER)
                        .setPassword(BuildConfig.TURN_PASS)
                        .createIceServer()
                )
            }
        }

        val pc = pcFactory.createPeerConnection(
            PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            },
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: IceCandidate) {
                    listener.onLocalCandidate(
                        SignalingMessage.Candidate(
                            candidate = candidate.sdp,
                            sdpMid = candidate.sdpMid,
                            sdpMLineIndex = candidate.sdpMLineIndex,
                        )
                    )
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    Log.i(TAG, "iceConnectionState=$state")
                    when (state) {
                        PeerConnection.IceConnectionState.CONNECTED,
                        PeerConnection.IceConnectionState.COMPLETED -> listener.onConnected()
                        PeerConnection.IceConnectionState.FAILED -> listener.onFailed()
                        else -> Unit
                    }
                }

                override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
                override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit
                override fun onAddStream(stream: MediaStream) = Unit
                override fun onRemoveStream(stream: MediaStream) = Unit
                override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit
                override fun onRenegotiationNeeded() = Unit
                override fun onTrack(transceiver: RtpTransceiver) = Unit
            },
        ) ?: run {
            listener.onFailed()
            return
        }
        peerConnection = pc

        val audioSource = pcFactory.createAudioSource(MediaConstraints())
        val track = pcFactory.createAudioTrack("local_audio", audioSource)
        localAudioTrack = track
        pc.addTrack(track, listOf("stream"))
    }

    fun createOffer() {
        val pc = peerConnection ?: return
        pc.createOffer(
            object : SimpleSdpObserver() {
                override fun onCreateSuccess(sdp: SessionDescription) {
                    pc.setLocalDescription(SimpleSdpObserver(), sdp)
                    listener.onLocalDescription(SignalingMessage.Offer(sdp.description))
                }
            },
            MediaConstraints(),
        )
    }

    fun handleRemoteOffer(sdp: String) {
        val pc = peerConnection ?: return
        pc.setRemoteDescription(
            object : SimpleSdpObserver() {
                override fun onSetSuccess() = flushCandidates()
            },
            SessionDescription(SessionDescription.Type.OFFER, sdp),
        )
        pc.createAnswer(
            object : SimpleSdpObserver() {
                override fun onCreateSuccess(answer: SessionDescription) {
                    pc.setLocalDescription(SimpleSdpObserver(), answer)
                    listener.onLocalDescription(SignalingMessage.Answer(answer.description))
                }
            },
            MediaConstraints(),
        )
    }

    fun handleRemoteAnswer(sdp: String) {
        val pc = peerConnection ?: return
        pc.setRemoteDescription(
            object : SimpleSdpObserver() {
                override fun onSetSuccess() = flushCandidates()
            },
            SessionDescription(SessionDescription.Type.ANSWER, sdp),
        )
    }

    fun handleRemoteCandidate(candidate: String, sdpMid: String, sdpMLineIndex: Int) {
        val pc = peerConnection ?: return
        val ice = IceCandidate(sdpMid, sdpMLineIndex, candidate)
        candidateBuffer.addOrBuffer(ice).forEach { addCandidateLogged(pc, it) }
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun close() {
        peerConnection?.dispose()
        peerConnection = null
        localAudioTrack = null
        candidateBuffer.clear()
        factory?.dispose()
        factory = null
        eglBase.release()
    }

    private fun flushCandidates() {
        val pc = peerConnection ?: return
        candidateBuffer.onRemoteDescriptionSet().forEach { addCandidateLogged(pc, it) }
    }

    /** 거부된 후보가 조용히 사라지면 "그냥 안 되는" 연결이 된다. */
    private fun addCandidateLogged(pc: PeerConnection, candidate: IceCandidate) {
        if (!pc.addIceCandidate(candidate)) {
            Log.w(TAG, "addIceCandidate rejected: ${candidate.sdp}")
        }
    }

    private companion object {
        const val TAG = "WebRtcAudioSession"
        const val STUN_URL = "stun:stun.l.google.com:19302"
    }
}

/** SdpObserver 의 네 메서드를 매번 쓰지 않기 위한 기본 구현. */
open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) = Unit
    override fun onSetSuccess() = Unit
    override fun onCreateFailure(error: String?) {
        Log.w("WebRtcAudioSession", "createSdp failed: $error")
    }
    override fun onSetFailure(error: String?) {
        Log.w("WebRtcAudioSession", "setSdp failed: $error")
    }
}
```

- [ ] **Step 3: TURN 설정을 BuildConfig 로 넣는다**

Task 4 에서 만든 `studymeet/build.gradle.kts` 의 `android { }` 블록을 아래로 **교체한다.** `defaultConfig` 를 새로 만들지 말고 기존 것을 이 내용으로 대체한다 — 블록이 두 개가 되면 Gradle 이 마지막 것만 쓰고 앞의 설정이 조용히 사라진다.

```kotlin
android {
    namespace = "com.wjthinkbig.studymeet"
    compileSdk = libs.versions.android.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.android.minSdk.get().toInt()

        // TURN 은 빌드 타임 선택이다. local.properties 에 값이 없으면 빈 문자열이 되어
        // STUN 만 쓴다. 자격증명을 커밋하지 않기 위한 구조다.
        val localProps = java.util.Properties().apply {
            val f = rootProject.file("local.properties")
            if (f.exists()) f.inputStream().use { load(it) }
        }
        buildConfigField("String", "TURN_URL", "\"${localProps.getProperty("turn.url") ?: ""}\"")
        buildConfigField("String", "TURN_USER", "\"${localProps.getProperty("turn.user") ?: ""}\"")
        buildConfigField("String", "TURN_PASS", "\"${localProps.getProperty("turn.pass") ?: ""}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}
```

- [ ] **Step 4: 컴파일한다**

Run: `.\gradlew.bat :studymeet:assembleDebug --console=plain`
Expected: `BUILD SUCCESSFUL`

---

## Task 7: 엔진 조립

**Files:**
- Create: `studymeet/src/main/java/com/wjthinkbig/studymeet/AndroidLessonCallEngine.kt`
- Modify: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainApplication.kt`

**Interfaces:**
- Consumes: `LessonCallEngine`, `LessonCallState`, `CallFailure` (Task 3); `SignalingClient`, `WebRtcAudioSession`, `SignalingMessage` (Tasks 5–6)
- Produces: `AndroidLessonCallEngine(context)` — `LessonCallEngine` 구현

- [ ] **Step 1: 엔진을 만든다**

`studymeet/src/main/java/com/wjthinkbig/studymeet/AndroidLessonCallEngine.kt`:

```kotlin
package com.wjthinkbig.studymeet

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.CallFailure
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallEngine
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 시그널링과 오디오 세션을 엮어 통화를 만든다.
 * LessonCallEngine 을 구현하는 유일한 클래스다.
 */
class AndroidLessonCallEngine(
    private val context: Context,
) : LessonCallEngine {

    private val _state = MutableStateFlow<LessonCallState>(LessonCallState.Idle)
    override val state: StateFlow<LessonCallState> = _state.asStateFlow()

    private var signaling: SignalingClient? = null
    private var session: WebRtcAudioSession? = null
    private var isCaller = false

    override fun join(signalingUrl: String, room: String, isCaller: Boolean) {
        if (!hasMicPermission()) {
            _state.value = LessonCallState.Failed(CallFailure.NO_MIC_PERMISSION)
            return
        }
        this.isCaller = isCaller
        _state.value = LessonCallState.Connecting

        // 태블릿을 귀에 대고 쓰지 않는다. 기본값은 수화부로 잡힐 수 있다.
        routeAudioToSpeaker()

        val audio = WebRtcAudioSession(context.applicationContext, audioListener)
        session = audio
        runCatching { audio.start() }.onFailure {
            Log.w(TAG, "audio session start failed: ${it.message}")
            _state.value = LessonCallState.Failed(CallFailure.ENGINE_ERROR)
            return
        }

        val url = if (signalingUrl.contains("?")) "$signalingUrl&room=$room" else "$signalingUrl/?room=$room"
        val client = SignalingClient(url, signalingListener)
        signaling = client
        client.connect()
    }

    override fun setMicEnabled(enabled: Boolean) {
        session?.setMicEnabled(enabled)
    }

    override fun leave() {
        signaling?.close()
        signaling = null
        session?.close()
        session = null
        _state.value = LessonCallState.Idle
    }

    private val signalingListener = object : SignalingClient.Listener {
        override fun onReady() {
            // 선생님이 caller 다. 아이는 offer 를 기다린다 (설계 §3.1).
            if (isCaller) session?.createOffer()
        }

        override fun onMessage(message: SignalingMessage) {
            when (message) {
                is SignalingMessage.Offer -> session?.handleRemoteOffer(message.sdp)
                is SignalingMessage.Answer -> session?.handleRemoteAnswer(message.sdp)
                is SignalingMessage.Candidate -> session?.handleRemoteCandidate(
                    message.candidate, message.sdpMid, message.sdpMLineIndex,
                )
                else -> Unit
            }
        }

        override fun onPeerLeft() {
            Log.i(TAG, "peer left")
        }

        override fun onFailure(error: Throwable) {
            _state.value = LessonCallState.Failed(CallFailure.SIGNALING_UNREACHABLE)
        }
    }

    private val audioListener = object : WebRtcAudioSession.Listener {
        override fun onLocalDescription(message: SignalingMessage) {
            signaling?.send(message)
        }

        override fun onLocalCandidate(message: SignalingMessage.Candidate) {
            signaling?.send(message)
        }

        override fun onConnected() {
            _state.value = LessonCallState.Connected
        }

        override fun onFailed() {
            _state.value = LessonCallState.Failed(CallFailure.ICE_FAILED)
        }
    }

    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun routeAudioToSpeaker() {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = true
    }

    private companion object {
        const val TAG = "LessonCallEngine"
    }
}
```

`androidx.core.content.ContextCompat` 를 쓰므로 `studymeet/build.gradle.kts` 의 `dependencies` 에 한 줄을 더한다:

```kotlin
    implementation(libs.androidx.core.ktx)
```

- [ ] **Step 2: 진짜 구현을 바인딩한다**

`composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainApplication.kt` 의 `androidLessonCallModule` 을 아래로 교체하고, `NoopLessonCallEngine` import 를 지운 뒤 새 import 를 더한다:

```kotlin
import com.wjthinkbig.studymeet.AndroidLessonCallEngine

private val androidLessonCallModule = module {
    single<LessonCallEngine> { AndroidLessonCallEngine(get()) }
}
```

`get()` 은 `androidContext(...)` 로 등록된 `Context` 를 받는다.

- [ ] **Step 3: 컴파일한다**

Run: `.\gradlew.bat :composeApp:compileBookpadDebugKotlinAndroid --console=plain`
Expected: `BUILD SUCCESSFUL`

---

## Task 8: 입장 정보 조회를 앱에 붙인다

**Files:**
- Create: `shared/.../feature/lesson/data/remote/dto/JoinInfoDto.kt`
- Create: `shared/.../feature/lesson/domain/model/JoinInfo.kt`
- Create: `shared/.../feature/lesson/domain/usecase/GetJoinInfoUseCase.kt`
- Modify: `shared/.../feature/lesson/data/remote/api/LessonApi.kt`
- Modify: `shared/.../feature/lesson/domain/repository/LessonRepository.kt`
- Modify: `shared/.../feature/lesson/data/repository/LessonRepositoryImpl.kt`
- Modify: `shared/.../feature/lesson/di/LessonModule.kt`
- Delete: `shared/.../feature/lesson/domain/model/LessonEntry.kt`

**Interfaces:**
- Consumes: Task 2 의 응답 형태
- Produces: `JoinInfo(sessionId, signalingUrl, room, isCaller, teacherName)`, `GetJoinInfoUseCase(customerNumber, sessionId?): Result<JoinInfo>`

- [ ] **Step 1: DTO 와 도메인 모델을 만든다**

`shared/.../feature/lesson/data/remote/dto/JoinInfoDto.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto

import kotlinx.serialization.Serializable

/** GET /students/{customerNumber}/current-session 응답. 봉투가 없는 평평한 형태다. */
@Serializable
data class JoinInfoDto(
    val sessionId: String,
    val signalingUrl: String,
    val room: String,
    val role: String,
    val teacherName: String,
    val scheduledAt: String,
)
```

`shared/.../feature/lesson/domain/model/JoinInfo.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.model

/**
 * 수업에 들어가는 데 필요한 것 전부.
 *
 * role 문자열 대신 Boolean 으로 바꿔 둔다 — 통화 엔진이 알아야 하는 것은
 * "내가 offer 를 만드는가" 하나뿐이다.
 */
data class JoinInfo(
    val sessionId: String,
    val signalingUrl: String,
    val room: String,
    val isCaller: Boolean,
    val teacherName: String,
)
```

- [ ] **Step 2: API 에 엔드포인트를 더한다**

`shared/.../feature/lesson/data/remote/api/LessonApi.kt` 를 아래로 교체한다:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.data.remote.api

import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto.DeviceRegistrationDto
import com.wjthinkbig.bookclub3app.feature.lesson.data.remote.dto.JoinInfoDto
import de.jensklingenberg.ktorfit.http.Body
import de.jensklingenberg.ktorfit.http.GET
import de.jensklingenberg.ktorfit.http.POST
import de.jensklingenberg.ktorfit.http.Path
import de.jensklingenberg.ktorfit.http.Query

interface LessonApi {
    /** 기기 푸시 토큰 등록. 성공 시 204 라 본문이 없다. */
    @POST("devices")
    suspend fun registerDevice(@Body body: DeviceRegistrationDto)

    /**
     * 지금 들어갈 수 있는 수업의 입장 정보.
     * sessionId 를 주면 그 수업, 없으면 서버가 고른다. 없으면 404 다.
     */
    @GET("students/{customerNumber}/current-session")
    suspend fun getCurrentSession(
        @Path("customerNumber") customerNumber: String,
        @Query("sessionId") sessionId: String? = null,
    ): JoinInfoDto
}
```

- [ ] **Step 3: 저장소와 UseCase 를 더한다**

`shared/.../feature/lesson/domain/repository/LessonRepository.kt` 에 메서드를 더한다:

```kotlin
    suspend fun getJoinInfo(customerNumber: String, sessionId: String?): Result<JoinInfo>
```

import 를 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.domain.model.JoinInfo
```

`shared/.../feature/lesson/data/repository/LessonRepositoryImpl.kt` 에 구현을 더한다:

```kotlin
    override suspend fun getJoinInfo(customerNumber: String, sessionId: String?): Result<JoinInfo> =
        runCatching {
            val dto = api.getCurrentSession(customerNumber, sessionId)
            JoinInfo(
                sessionId = dto.sessionId,
                signalingUrl = dto.signalingUrl,
                room = dto.room,
                // 서버가 아이에게 주는 role 은 callee 다. 그 외 값이 오면 offer 를 만들지 않는 쪽이 안전하다.
                isCaller = dto.role == "caller",
                teacherName = dto.teacherName,
            )
        }
```

필요한 import 를 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.domain.model.JoinInfo
```

`shared/.../feature/lesson/domain/usecase/GetJoinInfoUseCase.kt`:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase

import com.wjthinkbig.bookclub3app.feature.lesson.domain.model.JoinInfo
import com.wjthinkbig.bookclub3app.feature.lesson.domain.repository.LessonRepository

class GetJoinInfoUseCase(
    private val repository: LessonRepository,
) {
    suspend operator fun invoke(customerNumber: String, sessionId: String?): Result<JoinInfo> =
        repository.getJoinInfo(customerNumber, sessionId)
}
```

`shared/.../feature/lesson/di/LessonModule.kt` 에 한 줄을 더한다:

```kotlin
    factory { GetJoinInfoUseCase(get()) }
```

import 를 더한다:

```kotlin
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.GetJoinInfoUseCase
```

- [ ] **Step 4: 자리표시자를 지운다**

`shared/.../feature/lesson/domain/model/LessonEntry.kt` 파일을 삭제한다. 이제 세션 id 를 서버가 알려주므로 필요 없다.

`shared/.../core/navigation/RootComponent.kt` 에서 `LessonEntry` import 와 `openLesson(LessonEntry.MANUAL_SESSION_ID)` 호출을 고친다. `openLesson` 의 시그니처를 아래로 바꾼다:

```kotlin
    /**
     * 수업으로 들어간다.
     * @param sessionId 푸시로 들어온 경우의 세션 id. 화면의 버튼으로 들어오면 null 이고,
     *                  그때는 서버가 지금 들어갈 수업을 골라 준다.
     */
    fun openLesson(sessionId: String? = null) {
        val active = stack.value.active.configuration
        if (active is Screen.Lesson && active.sessionId == sessionId) {
            AppLogger.d("RootComponent") { "Lesson $sessionId already active, skipping push" }
            return
        }
        navigation.push(Screen.Lesson(sessionId))
    }
```

`Screen.Lesson` 의 `sessionId` 를 nullable 로 바꾼다 (`shared/.../core/navigation/Screen.kt`):

```kotlin
    @Serializable
    data class Lesson(val sessionId: String? = null) : Screen()
```

KRS 진입 콜백은 인자 없이 부른다:

```kotlin
            onOpenLesson = { openLesson() },
```

- [ ] **Step 5: 컴파일한다**

`Screen.Lesson.sessionId` 가 nullable 이 되면서 `LessonComponent` 가 컴파일되지 않는다. Task 9 에서 이 파일을 통째로 다시 쓰지만, 지금은 통과만 시킨다. `LessonComponent.kt` 에서 두 줄만 바꾼다.

바꾸기 전:

```kotlin
    sessionId: String,
```
```kotlin
    private val _uiState = MutableStateFlow(LessonUiState(sessionId = sessionId))
```

바꾼 뒤:

```kotlin
    sessionId: String?,
```
```kotlin
    private val _uiState = MutableStateFlow(LessonUiState(sessionId = sessionId.orEmpty()))
```

Run: `.\gradlew.bat :composeApp:compileBookpadDebugKotlinAndroid --console=plain`
Expected: `BUILD SUCCESSFUL`

---

## Task 9: 화면이 통화를 몰고 간다

**Files:**
- Modify: `shared/.../feature/lesson/presentation/viewmodel/LessonUiState.kt`
- Modify: `shared/.../feature/lesson/presentation/viewmodel/LessonIntent.kt`
- Modify: `shared/.../feature/lesson/presentation/viewmodel/LessonComponent.kt`
- Modify: `shared/.../core/navigation/RootComponent.kt`
- Modify: `composeApp/.../ui/lesson/LessonScreen.kt`

**Interfaces:**
- Consumes: `LessonCallEngine`, `LessonCallState`, `CallFailure` (Task 3), `GetJoinInfoUseCase` (Task 8), `UserSessionManager` (기존)
- Produces: `LessonComponent(componentContext, sessionId, sessionManager, getJoinInfo, callEngine, onLeave)`

- [ ] **Step 1: 상태와 의도를 넓힌다**

`LessonUiState.kt` 를 아래로 교체한다:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.CallFailure

data class LessonUiState(
    val teacherName: String = "",
    val phase: LessonPhase = LessonPhase.Loading,
    val isMicEnabled: Boolean = true,
)

/**
 * 화면이 보여줄 단계.
 *
 * 통화 상태(LessonCallState)와 분리한 이유는, 입장 정보 조회 실패처럼
 * 통화가 시작되기도 전의 실패가 따로 있기 때문이다.
 */
sealed class LessonPhase {
    data object Loading : LessonPhase()
    data object NoSession : LessonPhase()
    data object Connecting : LessonPhase()
    data object Connected : LessonPhase()
    data class Failed(val reason: CallFailure?) : LessonPhase()
}
```

`LessonIntent.kt` 를 아래로 교체한다:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

sealed class LessonIntent {
    data object Leave : LessonIntent()
    data object Retry : LessonIntent()
    data object ToggleMic : LessonIntent()
}
```

- [ ] **Step 2: Component 를 고친다**

`LessonComponent.kt` 를 아래로 교체한다:

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel

import com.arkivanov.decompose.ComponentContext
import com.arkivanov.essenty.lifecycle.doOnDestroy
import com.wjthinkbig.bookclub3app.core.common.SideEffectComponent
import com.wjthinkbig.bookclub3app.core.logging.AppLogger
import com.wjthinkbig.bookclub3app.core.user.manager.UserSessionManager
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallEngine
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.LessonCallState
import com.wjthinkbig.bookclub3app.feature.lesson.domain.usecase.GetJoinInfoUseCase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * 수업 화면.
 *
 * 입장 정보를 조회하고 통화를 시작한 뒤, 엔진의 상태를 화면 단계로 옮긴다.
 * 통화의 내부는 모른다 — LessonCallEngine 인터페이스만 안다.
 */
class LessonComponent(
    componentContext: ComponentContext,
    private val sessionId: String?,
    private val sessionManager: UserSessionManager,
    private val getJoinInfo: GetJoinInfoUseCase,
    private val callEngine: LessonCallEngine,
    private val onLeave: () -> Unit,
) : ComponentContext by componentContext, SideEffectComponent<LessonSideEffect> {

    private val componentScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _uiState = MutableStateFlow(LessonUiState())
    val uiState = _uiState.asStateFlow()

    private val _sideEffect = Channel<LessonSideEffect>(Channel.BUFFERED)
    override val sideEffect: Flow<LessonSideEffect> = _sideEffect.receiveAsFlow()

    private val customerNumber: String
        get() = sessionManager.state.value.session?.childCustomerNumber.orEmpty()

    init {
        componentScope.launch {
            callEngine.state.collect { call ->
                _uiState.update { it.copy(phase = call.toPhase(it.phase)) }
            }
        }
        lifecycle.doOnDestroy {
            // 화면이 사라지면 통화도 끝난다. 백그라운드 전환에서는 끊지 않는다 (설계 §4.1).
            callEngine.leave()
            componentScope.cancel()
        }
        connect()
    }

    fun handleIntent(intent: LessonIntent) {
        when (intent) {
            is LessonIntent.Leave -> {
                callEngine.leave()
                onLeave()
            }
            is LessonIntent.Retry -> connect()
            is LessonIntent.ToggleMic -> {
                val next = !_uiState.value.isMicEnabled
                callEngine.setMicEnabled(next)
                _uiState.update { it.copy(isMicEnabled = next) }
            }
        }
    }

    fun navigateBack() {
        callEngine.leave()
        onLeave()
    }

    private fun connect() {
        _uiState.update { it.copy(phase = LessonPhase.Loading) }
        componentScope.launch {
            if (customerNumber.isBlank()) {
                AppLogger.w("LessonComponent") { "childCustomerNumber is blank" }
                _uiState.update { it.copy(phase = LessonPhase.NoSession) }
                return@launch
            }
            getJoinInfo(customerNumber, sessionId)
                .onSuccess { info ->
                    _uiState.update {
                        it.copy(teacherName = info.teacherName, phase = LessonPhase.Connecting)
                    }
                    callEngine.join(info.signalingUrl, info.room, info.isCaller)
                }
                .onFailure { error ->
                    AppLogger.w("LessonComponent") { "join info failed: ${error.message}" }
                    _uiState.update { it.copy(phase = LessonPhase.NoSession) }
                }
        }
    }

    /** 조회 단계의 실패(NoSession)를 통화 상태가 덮어쓰지 않게 한다. */
    private fun LessonCallState.toPhase(current: LessonPhase): LessonPhase = when (this) {
        is LessonCallState.Idle -> current
        is LessonCallState.Connecting -> LessonPhase.Connecting
        is LessonCallState.Connected -> LessonPhase.Connected
        is LessonCallState.Failed -> LessonPhase.Failed(reason)
    }
}
```

`AppLogger.w` 가 없으면 `AppLogger.i` 로 바꾼다.

- [ ] **Step 3: RootComponent 에서 의존성을 넘긴다**

`shared/.../core/navigation/RootComponent.kt` 의 `is Screen.Lesson ->` 분기를 아래로 교체한다:

```kotlin
            is Screen.Lesson -> Child.Lesson(
                LessonComponent(
                    componentContext = context,
                    sessionId = screen.sessionId,
                    sessionManager = get(),
                    getJoinInfo = get(),
                    callEngine = get(),
                    onLeave = { navigation.pop() },
                )
            )
```

- [ ] **Step 4: 화면을 고친다**

`composeApp/.../ui/lesson/LessonScreen.kt` 를 아래로 교체한다. 테마 토큰 이름이 다르면 실제 존재하는 것으로 바꾼다.

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
import com.wjthinkbig.bookclub3app.feature.lesson.domain.call.CallFailure
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonComponent
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonIntent
import com.wjthinkbig.bookclub3app.feature.lesson.presentation.viewmodel.LessonPhase
import com.wjthinkbig.bookclub3app.ui.common.BackHandler
import com.wjthinkbig.bookclub3app.ui.theme.BookclubTheme

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
            verticalArrangement = Arrangement.spacedBy(BookclubTheme.dimensions.space.space16),
        ) {
            Text(
                text = headline(uiState.phase, uiState.teacherName),
                color = BookclubTheme.colors.textInversePrimary,
                style = BookclubTheme.typography.titlePrimary1,
            )
            detail(uiState.phase)?.let { message ->
                Text(
                    text = message,
                    color = BookclubTheme.colors.textInversePrimary,
                    style = BookclubTheme.typography.bodyPrimary1,
                )
            }
            if (uiState.phase is LessonPhase.Failed || uiState.phase is LessonPhase.NoSession) {
                TextButton(onClick = { component.handleIntent(LessonIntent.Retry) }) {
                    Text(
                        text = "다시 시도",
                        color = BookclubTheme.colors.textInversePrimary,
                        style = BookclubTheme.typography.bodyPrimary1,
                    )
                }
            }
            if (uiState.phase is LessonPhase.Connected) {
                TextButton(onClick = { component.handleIntent(LessonIntent.ToggleMic) }) {
                    Text(
                        text = if (uiState.isMicEnabled) "마이크 끄기" else "마이크 켜기",
                        color = BookclubTheme.colors.textInversePrimary,
                        style = BookclubTheme.typography.bodyPrimary1,
                    )
                }
            }
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

private fun headline(phase: LessonPhase, teacherName: String): String = when (phase) {
    is LessonPhase.Loading -> "수업을 찾고 있어요"
    is LessonPhase.NoSession -> "지금 들어갈 수업이 없어요"
    is LessonPhase.Connecting ->
        if (teacherName.isBlank()) "선생님과 연결 중이에요" else "${teacherName} 선생님과 연결 중이에요"
    is LessonPhase.Connected ->
        if (teacherName.isBlank()) "수업 중이에요" else "${teacherName} 선생님과 수업 중이에요"
    is LessonPhase.Failed -> "연결하지 못했어요"
}

/** 실패 사유마다 아이가 할 수 있는 일이 다르다. 하나로 뭉치지 않는다 (설계 §5). */
private fun detail(phase: LessonPhase): String? = when (phase) {
    is LessonPhase.Failed -> when (phase.reason) {
        CallFailure.NO_MIC_PERMISSION -> "마이크를 켜야 수업에 들어갈 수 있어요"
        CallFailure.SIGNALING_UNREACHABLE -> "수업 서버에 연결하지 못했어요"
        CallFailure.ICE_FAILED -> "선생님과 연결하지 못했어요"
        CallFailure.ENGINE_ERROR, null -> "문제가 생겼어요"
    }
    is LessonPhase.NoSession -> "수업 시간 5분 전부터 들어갈 수 있어요"
    else -> null
}
```

- [ ] **Step 5: 컴파일하고 기기에 넣는다**

Run: `.\gradlew.bat :composeApp:installBookpadDebug --console=plain`
Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`

- [ ] **Step 6: 조회 경로를 기기에서 확인한다**

백엔드와 `adb reverse tcp:3000 tcp:3000` 이 필요하다.

```
adb logcat -c
adb shell am start -n com.wjthinkbig.bookclub3app.bookpad/com.wjthinkbig.bookclub3app.MainActivity
```

앱에서 KRS 도서관 탭 → [수업 들어가기] 를 누른다.

Expected: 화면이 "수업을 찾고 있어요" 를 지나 "김선생 선생님과 연결 중이에요" 로 바뀐다. 시드 세션이 없으면 "지금 들어갈 수업이 없어요" 가 나온다 — 그것도 정상 동작이다.

```
adb logcat -d -s LessonComponent:* LessonCallEngine:* SignalingClient:* WebRtcAudioSession:*
```

관찰한 것을 보고서에 그대로 적는다.

---

## Task 10: 마이크 권한을 화면에서 다시 요청할 수 있게 한다

`MainActivity` 는 시작 시 한 번 `RECORD_AUDIO` 를 요청한다. 아이가 그때 거부하면 수업 화면에서 다시 요청할 방법이 없다.

**Files:**
- Modify: `composeApp/src/androidMain/kotlin/com/wjthinkbig/bookclub3app/MainActivity.kt`

**Interfaces:**
- Consumes: 없음
- Produces: `MainActivity.requestMicPermission()` — 다른 곳에서 부를 수 있는 공개 메서드

- [ ] **Step 1: 재요청 경로를 만든다**

`MainActivity` 의 `micPermissionLauncher` 아래에 아래를 더한다:

```kotlin
    /**
     * 수업 화면에서 마이크 권한을 다시 요청한다.
     * 시작 시 한 번 거부한 아이가 수업에 들어갈 길이 없으면 안 된다.
     */
    fun requestMicPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
```

- [ ] **Step 2: 앱으로 돌아올 때 다시 묻는다**

권한 대화상자는 액티비티만 띄울 수 있고, 수업 화면은 `composeApp/commonMain` 의 컴포저블이다. 그 사이에 `LocalActivity` 같은 배관을 새로 놓지 않는다 — 이 앱에 그런 전례가 없고, 한 곳에서만 쓸 배관을 만들면 다음 사람이 그 규칙을 또 배워야 한다.

대신 액티비티가 포그라운드로 돌아올 때 스스로 확인한다. `MainActivity` 에 아래를 더한다:

```kotlin
    override fun onResume() {
        super.onResume()
        // 마이크 없이 통화에 실패한 아이가 설정에서 권한을 켜고 돌아오는 경로,
        // 그리고 시작 시 한 번 거부한 아이가 다시 묻는 화면을 보는 경로다.
        requestMicPermission()
    }
```

이러면 아이가 할 일은 하나다 — 실패 화면에서 [다시 시도] 를 누르는 것. 권한이 없으면 `AndroidLessonCallEngine.join` 이 즉시 `NO_MIC_PERMISSION` 으로 떨어뜨리고, 앱을 나갔다 돌아오면 대화상자가 다시 뜬다.

`requestMicPermission()` 이 이미 허용된 경우에는 아무것도 하지 않으므로, 매번 `onResume` 에서 불러도 대화상자가 반복해 뜨지 않는다.

- [ ] **Step 3: 컴파일한다**

Run: `.\gradlew.bat :composeApp:compileBookpadDebugKotlinAndroid --console=plain`
Expected: `BUILD SUCCESSFUL`

---

## Task 11: 실기기 음성 확인

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1–10 전부

- [ ] **Step 1: coturn 을 띄운다**

```
docker run -d --name studymeet-turn -p 3478:3478/tcp -p 3478:3478/udp coturn/coturn:4.6 ^
  -n --lt-cred-mech --fingerprint --user=studymeet:localturnpass ^
  --realm=studymeet.local --listening-port=3478 --no-tls --no-dtls --allow-loopback-peers
```

Expected: 컨테이너가 뜨고 `docker logs studymeet-turn` 에 `Relay ports initialization done` 이 보인다.

- [ ] **Step 2: 앱에 TURN 을 넣는다**

북클럽 프로젝트의 `local.properties` 에 세 줄을 더한다 (커밋하지 않는다):

```properties
turn.url=turn:127.0.0.1:3478?transport=tcp
turn.user=studymeet
turn.pass=localturnpass
```

Run: `.\gradlew.bat :composeApp:installBookpadDebug --console=plain`

- [ ] **Step 3: 포트를 연결한다**

```
adb reverse tcp:3000 tcp:3000
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3478 tcp:3478
adb reverse --list
```

Expected: 세 줄이 모두 보인다.

- [ ] **Step 4: 양쪽을 붙인다**

1. 백엔드(`npm run dev`, 포트 3000), 시그널링(`node signaling/server.js`, `PORT=8081`), teacher-web(`npm run dev -- --port 5174`) 을 띄운다.
2. 브라우저에서 `http://localhost:5174/` → 시드 세션 [입장] → [수업 시작]. 카메라·마이크 권한을 허용한다.
3. 태블릿에서 KRS 도서관 → [수업 들어가기].

Expected: 태블릿 화면이 "…선생님과 수업 중이에요" 로 바뀌고, **양쪽에서 서로의 소리가 들린다.**

- [ ] **Step 5: 관찰한 것을 기록한다**

```
adb logcat -d -s LessonCallEngine:* WebRtcAudioSession:* SignalingClient:*
docker logs studymeet-turn --tail 20
```

아래를 보고서에 적는다.

| 항목 | 확인 |
|---|---|
| `iceConnectionState` 가 CONNECTED 에 도달했는가 | |
| 태블릿에서 선생님 소리가 들리는가 | |
| 선생님 쪽에서 아이 소리가 들리는가 | |
| coturn 로그에 allocation 이 생겼는가 (릴레이를 탔는가) | |
| 마이크 끄기·켜기가 상대에게 반영되는가 | |

- [ ] **Step 6: 설계 문서의 열린 이슈를 갱신한다**

`docs/superpowers/specs/2026-08-12-lesson-audio-call-design.md` §7 에 이번에 확인된 것과 확인되지 않은 것을 적는다. 특히 §7-2(서로 다른 망을 넘는 통화)는 이 검증으로 답이 나오지 않는다 — USB 로 우회했기 때문이다. 그 사실을 명시한다.
