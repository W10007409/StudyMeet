# 수업 호출 푸시 요건정의 및 설계

- 작성일: 2026-08-11
- 대상: 선생님이 아이 태블릿으로 푸시를 보내 수업 방에 입장시키는 경로
- 관련 문서: `2026-08-07-teacher-lesson-screen-design.md` §6.1 (이하 "화면 설계"), `2026-08-06-studymeet-video-tutoring-design.md` §4.4 (이하 "본 설계"), `2026-08-07-lesson-scheduling-design.md` (이하 "편성 설계")
- 상태: 설계 확정, 구현 계획 대기

---

## 1. 범위 — 부르는 것까지이고, 통화는 아니다

이 스펙이 끝났을 때 되는 것은 하나다. **선생님이 대기실에서 [알림 보내기]를 누르면 아이 태블릿에 전화 오는 것 같은 전체화면이 뜨고, [들어가기]를 누르면 앱이 수업 화면 목적지로 전환된다.**

수업 화면 자체는 "연결 준비 중" 껍데기다. 그 안을 채우는 것은 별도 스펙(화상 모듈)이다.

| 만든다 | 만들지 않는다 |
|---|---|
| 기기 토큰 등록 API | 스케줄링 백엔드 인증 |
| `nudge` 실제 발송 (현재 스텁) | iOS 푸시 (APNs 인증키 미확보) |
| 아이 앱의 FCM 수신 | 아이 앱의 로그인 화면 |
| 전체화면 호출 화면 | WebRTC · 카메라 · PiP |
| 수업 화면 목적지와 진입 경로 | 무음 프리체크 (본 설계 §7.5) |

### 1.1 왜 둘로 나누었는가

원래 요청은 "푸시로 아이를 부르고 화상 수업을 붙인다"였다. 이 둘은 서로를 기다리지 않는다.

- 푸시 경로는 화상이 없어도 **끝까지 검증된다**. 알림이 뜨고, 탭하면 화면이 전환된다.
- 화상 모듈은 푸시가 없어도 개발된다. 입장은 개발용 버튼으로 대신할 수 있다.

게다가 화상의 실측(릴레이 비율)은 공인 IP TURN 서버가 준비되어야 가능하다. 푸시를 그 일정에 묶을 이유가 없다.

---

## 2. 전제 — 대상 앱은 북클럽 앱이다

이 기능은 `app-bookclub3-master` (`rootProject.name = "Bookclub3App"`)에 들어간다. StudyMeet 저장소의 `app` 모듈은 빈 골격이며 이 스펙에서 쓰지 않는다.

### 2.1 그 앱의 구조에서 이 설계를 제약하는 사실들

| 사실 | 근거 | 이 설계에 미치는 영향 |
|---|---|---|
| Kotlin Multiplatform + Compose Multiplatform | `settings.gradle.kts:31-32` (`:composeApp`, `:shared`) | 안드로이드 전용 코드는 `androidMain`에만 둔다 |
| 네비게이션은 Decompose | `core/navigation/RootComponent.kt:83,102-107` | 새 화면은 `Screen` 목적지 + `Child` + `createChild()` 세 곳에 등록 |
| 화면 패턴은 MVI + Component | `feature/home/presentation/viewmodel/HomeComponent.kt:24-76` | `{F}UiState/Intent/SideEffect/Component` 4파일 규약을 따른다 |
| Koin DI, 모듈 목록이 두 곳에 중복 | `MainApplication.kt:57-81`, `KoinHelper.kt:42-65` | 새 모듈을 **양쪽 모두**에 등록해야 iOS 빌드가 깨지지 않는다 |
| HTTP는 Ktor + Ktorfit, 응답은 `{resultCode, resultMessage, data}` 봉투 | `core/network/client/HttpClientFactory.kt:129-181` | 스케줄링 백엔드는 이 봉투를 쓰지 않는다 — §5.3 참조 |
| Firebase가 전혀 없다 | 저장소 전체 검색 0건 | 플러그인·의존성·매니페스트 서비스를 처음부터 추가 |
| 선언된 서비스·리시버·프로바이더가 하나도 없다 | `composeApp/src/androidMain/AndroidManifest.xml` | `FirebaseMessagingService`가 이 앱의 첫 서비스가 된다 |
| minSdk 24 | `gradle/libs.versions.toml:4` | PiP(API 26+)는 화상 모듈 스펙의 문제이며 여기서는 무관 |
| 권한은 INTERNET / RECORD_AUDIO / MODIFY_AUDIO_SETTINGS 뿐 | `AndroidManifest.xml:4-6` | `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT` 추가 필요 |

### 2.2 applicationId — 주어진 `google-services.json`은 쓸 수 없다

플레이버별로 applicationId가 갈린다 (`composeApp/build.gradle.kts:98,119-133`).

| 플레이버 | applicationId | 용도 |
|---|---|---|
| `bookpad` | `com.wjthinkbig.bookclub3app.bookpad` | 아이 태블릿 (이번 검증 대상) |
| `playStore` | `com.wjthinkbig.bookclub3app` | 스토어 배포 |

FCM은 applicationId로 앱을 식별한다. 저장소 루트에 놓인 `google-services.json`은 패키지가 `com.wjthinkbig.studymeet`으로 등록되어 있어 **이 앱에서는 동작하지 않는다.** 화상 모듈의 Kotlin 패키지 이름을 `com.wjthinkbig.studymeet`으로 짓는 것과는 무관한 문제다.

**필요한 것:** Firebase 콘솔에서 위 두 applicationId를 안드로이드 앱으로 등록하고 `google-services.json`을 새로 받아 `composeApp/`에 둔다. 최소한 `bookpad`는 반드시 필요하다.

---

## 3. 신원 — `childCustomerNumber`

아이 식별자는 이미 앱 안에 있다.

- 도메인 모델: `core/user/model/UserSession.kt:9-15` — `contractNumber`, `customerNumber`(보호자), `childCustomerNumber`(현재 선택된 자녀), `memberCode`, `packageName`
- 앱의 모든 API와 HTTP 헤더 `Customer-Number`는 **`childCustomerNumber`를 쓴다** (`HttpClientFactory.kt:157`). 이 스펙도 같은 값을 쓴다.
- 출처는 서버가 아니라 런처가 넘기는 인텐트 엑스트라다: `MainActivity.kt:157-163`, 키 `child_customer_number`. 북클럽 투데이에서 진입할 때 채워진다.
- 로그인 화면이 생기면 출처만 바뀐다. `AuthRepository`가 이미 교체를 전제로 설계되어 있다 (`core/auth/repository/AuthRepository.kt:11-13`).

### 3.1 저장하지 않으면 푸시가 깨진다

지금 이 값은 **메모리에만 있다** (`DummyAuthRepository.kt:23`). 어디에도 영속화되지 않는다.

푸시를 받아 앱이 새로 뜨는 경우 런처를 거치지 않으므로 인텐트 엑스트라가 없고, `BookPadSessionParams`는 기본 더미값(`MC1A000000`, `BookPadSessionParams.kt:19`)으로 남는다. 즉 **푸시로 깨어난 앱은 자기가 누구인지 모른다.**

따라서 기존 `UserPreferences`(multiplatform-settings, `core/datastore/UserPreferences.kt`)에 마지막으로 확인된 `childCustomerNumber`를 저장하고, 인텐트에 값이 없을 때 그것을 쓴다. 테스트 단계에서는 기본 더미값을 그대로 두어도 무방하다.

---

## 4. 데이터 모델

### 4.1 `Student.customerNumber` — 없는 연결 고리

스케줄링 DB의 `Student`는 `id`, `name`, `guardianPhone`만 갖는다 (`scheduling/prisma/schema.prisma:16`). 북클럽 앱의 `childCustomerNumber`와 이어지는 값이 없다. 이것이 없으면 **누구에게 보낼지 알 수 없다.**

```prisma
model Student {
  // ...기존 필드
  customerNumber String? @unique   // 북클럽 childCustomerNumber
}
```

`null` 허용이다. 기존 학생 데이터에 아직 번호가 없을 수 있고, 그 상태를 "매핑 안 됨"으로 정직하게 드러내는 편이 빈 문자열보다 낫다. 테스트 단계에서는 시드로 채운다.

### 4.2 `Device` — 새 모델

```prisma
model Device {
  id             String   @id @default(cuid())
  token          String   @unique
  customerNumber String
  platform       String                        // "android" | "ios"
  appVersion     String?
  updatedAt      DateTime @updatedAt

  @@index([customerNumber])
}
```

**`customerNumber`당 여러 토큰, 토큰당 하나의 `customerNumber`.** 아이 하나가 태블릿과 다른 기기를 쓸 수 있고, 반대로 하나의 태블릿을 형제가 나눠 쓸 수 있다. 같은 토큰이 다른 아이로 재등록되면 덮어쓴다 — 마지막 등록이 이긴다.

`Student`와 외래키로 잇지 않고 `customerNumber` 문자열로 느슨하게 둔다. 기기 등록 시점에 해당 학생이 아직 스케줄링 DB에 없을 수 있고, 등록을 그 이유로 거절하면 아이가 조용히 알림을 못 받게 된다.

---

## 5. 서버 API

### 5.1 `POST /devices` — 토큰 등록

요청 `{ customerNumber, token, platform, appVersion? }` → `204`.

`token` 기준 upsert. 소유자가 바뀌면 `customerNumber`를 갱신한다.

### 5.2 `POST /sessions/:id/nudge` — 발송

이미 존재하는 스텁(`scheduling/src/routes/session.ts:37-45`)을 채운다. 현재는 경고만 남기고 `{ delivered:false, reason:'FCM_NOT_CONFIGURED' }`를 돌려준다.

경로: 세션 → `Enrollment` → `Student.customerNumber` → `Device[]` → FCM.

**세션 상태 가드를 추가한다.** 현재 스텁에는 없다. `ENDED` / `CANCELLED` 세션에 대해서는 `409`를 준다. 끝난 수업에 아이를 부르는 알림이 가서는 안 된다.

### 5.3 응답 — 조용히 성공한 척하지 않는다

화면 설계 §6.1은 "조용히 성공한 척하지 말 것"을 명시한다. 기존 계약(`{ delivered, reason }`)을 유지하고 `reason`을 늘린다.

| `reason` | 뜻 | 선생님이 취할 행동 |
|---|---|---|
| `SENT` | 최소 한 대에 접수됨 | 기다린다 |
| `NO_CUSTOMER_NUMBER` | 학생에게 번호가 매핑되지 않음 | 운영 문의 |
| `NO_DEVICE` | 등록된 기기 없음 (앱 미설치·미실행) | 보호자 유선 안내 |
| `ALL_TOKENS_INVALID` | FCM이 모든 토큰을 거절 | 보호자 유선 안내 |
| `FCM_NOT_CONFIGURED` | 서버에 자격증명 없음 | 운영 문의 |

부분 성공은 숨기지 않는다. 응답에 `{ sent, failed }` 개수를 함께 담는다.

응답 형태는 스케줄링 백엔드의 기존 관례를 따른다. 이 백엔드는 북클럽 게이트웨이의 `{resultCode, resultMessage, data}` 봉투를 쓰지 않는다 — 앱은 두 서버를 각각 다른 규약으로 부르게 된다.

### 5.4 만료 토큰 정리

FCM이 `UNREGISTERED` 또는 `INVALID_ARGUMENT`를 반환한 토큰의 `Device` 행을 삭제한다. 하지 않으면 아이가 앱을 지운 뒤에도 영영 "보냈다"는 응답이 나오고, 선생님은 아이가 알림을 무시했다고 오해한다.

### 5.5 자격증명

서버가 FCM에 보내려면 **Firebase 서비스 계정 키(JSON)**가 필요하다. `scheduling/.env`에 경로 또는 값을 두고 커밋하지 않는다. 없으면 `FCM_NOT_CONFIGURED`를 그대로 반환한다 — 키가 없다고 서버가 뜨지 않아서는 안 된다.

---

## 6. 앱 구현

### 6.1 Firebase는 안드로이드에만 붙인다

루트와 `composeApp`에 google-services 플러그인, `composeApp/androidMain`에 firebase-bom + messaging을 추가한다. `commonMain`과 `:shared`는 건드리지 않는다. iOS 빌드를 깨뜨리지 않기 위함이고, KMP 공용 코드에 안드로이드 전용 SDK를 넣을 이유도 없다.

### 6.2 기능 코드 배치

기존 규약(`docs/ARCHITECTURE.md` §11 신규 Feature 추가 가이드)을 그대로 따른다.

```
shared/src/commonMain/.../feature/lesson/
  data/remote/{LessonApi.kt, LessonRemoteDataSource.kt, dto/}
  data/repository/LessonRepositoryImpl.kt
  domain/{model, repository, usecase}/
  di/LessonModule.kt
  presentation/viewmodel/{LessonUiState, LessonIntent, LessonSideEffect, LessonComponent}.kt

composeApp/src/commonMain/.../ui/lesson/LessonScreen.kt
composeApp/src/androidMain/.../lesson/{LessonCallMessagingService.kt, LessonCallActivity.kt, LessonNotifications.kt}
```

`LessonApi`를 `core/network/di/NetworkModule.kt`에 등록하고, `lessonModule`을 `MainApplication.kt`와 `KoinHelper.kt` **양쪽**에 추가한다.

스케줄링 백엔드는 북클럽 게이트웨이와 다른 호스트다. `ApiEndpoints`에 항목을 추가하고 별도 Ktorfit 인스턴스를 `named()`로 만든다 — DRM/Viewer가 이미 같은 방식으로 dev 게이트웨이를 쓰고 있다 (`NetworkModule.kt:61-62`).

### 6.3 토큰 등록 시점

`SplashComponent`가 `sessionManager.bootstrap()`을 성공시킨 직후. 그때 `childCustomerNumber`가 확정된다. FCM 토큰을 받아 `POST /devices`를 호출한다. `FirebaseMessaging.onNewToken`이 오면 다시 호출한다.

등록 실패는 화면에 띄우지 않되 로그로 남긴다. 아이에게 보여줄 만한 정보가 아니고, 다음 실행에서 다시 시도된다.

### 6.4 수신

`LessonCallMessagingService : FirebaseMessagingService`를 `composeApp/androidMain`에 두고 매니페스트에 등록한다. 이 앱의 첫 서비스 선언이 된다.

**data-only 고우선순위 메시지를 쓴다.** 알림 UI를 앱이 직접 만들어야 전체화면 인텐트를 걸 수 있기 때문이다. `notification` 필드가 있으면 앱이 백그라운드일 때 시스템이 알림을 대신 만들어 버려 전체화면이 불가능해진다.

페이로드:

```json
{ "type": "lesson_call", "sessionId": "...", "teacherName": "...", "scheduledAt": "..." }
```

### 6.5 호출 화면

별도 액티비티 `LessonCallActivity`로 둔다. 잠금화면 위에 떠야 하고 이는 액티비티 속성(`showWhenLocked`, `turnScreenOn`)이기 때문이다. 이 앱에는 이미 `WebViewActivity`라는 별도 액티비티 + 자체 Decompose 스택 전례가 있다 (`androidMain/.../webview/WebViewActivity.kt:65-103`).

[들어가기]를 누르면 `MainActivity`를 `com.wjthinkbig.bookclub3app.action.OPEN_LESSON` 액션과 `session_id` 엑스트라로 띄우고 자신은 종료한다. 기존 `OPEN_VIEWER` 경로와 동일한 결이다 (`MainActivity.kt:188-204`).

### 6.6 네비게이션

- `core/navigation/Screen.kt` — `@Serializable data class Lesson(val sessionId: String) : Screen`
- `RootComponent.Child.Lesson` 추가, `createChild()`에 분기 추가
- `App.kt`의 `RootChildContent`에 렌더 분기 추가
- `MainActivity`의 콜드 스타트 분기(`:86-93`)와 `onNewIntent`(`:115-131`)에 `OPEN_LESSON` 추가

화면 자체는 이번 스펙에서 "연결 준비 중" 껍데기다.

### 6.7 권한 — 전체화면은 보장되지 않는다

| 권한 | 필요 시점 | 처리 |
|---|---|---|
| `POST_NOTIFICATIONS` | API 33+ 런타임 요청 | `MainActivity`가 이미 `RECORD_AUDIO`를 요청한다(`:49-63`). 같은 자리에 추가 |
| `USE_FULL_SCREEN_INTENT` | API 34+ | **통화·알람 앱이 아니면 기본 거부된다** |

Android 14부터 전체화면 인텐트는 통화·알람 카테고리 앱에만 기본 허용된다. 거부되면 전체화면이 뜨지 않고 상단 헤드업 알림으로 떨어진다. 관리형 BookPad 단말이므로 기기 정책으로 허용될 여지가 있으나 확인 전에는 장담할 수 없다.

**따라서 전체화면을 시도하되 실패를 정상 경로로 처리한다.** 알림에 full-screen intent와 content intent를 모두 걸고, 어느 쪽으로 뜨든 탭하면 같은 곳으로 간다. 실제 동작은 태블릿에서 측정해 확인한다(§8).

---

## 7. 실패 처리와 관측

"보냈는데 안 떴다"를 좁히는 것이 이 기능의 핵심 난제다. 경계가 넷이고 각각 조용히 실패할 수 있다. 경계마다 흔적을 남긴다.

| 경계 | 남기는 것 | 남기지 않으면 |
|---|---|---|
| 서버가 기기를 찾았나 | `nudge` 응답 `reason` + 대상 토큰 수 | 번호 미매핑과 앱 미설치가 구분되지 않는다 |
| FCM이 접수했나 | 토큰별 `messageId` 또는 오류 코드 | 서버 문제와 구글 쪽 거절이 뭉개진다 |
| 기기가 받았나 | 수신 로그 (`sessionId`, 수신 시각) | 절전 지연인지 앱 버그인지 모른다 |
| 알림이 떴나 | 전체화면인지 헤드업인지 | 권한 거부를 코드 버그로 오진한다 |

### 7.1 절전은 코드로 해결되지 않는다

고우선순위 메시지는 Doze를 깨운다. 그러나 삼성 기기의 배터리 최적화가 앱을 절전 대상으로 두면 전달이 지연되거나 묶인다. 관리형 단말이므로 기기 정책으로 예외 처리할 여지가 있다.

이것은 구현 항목이 아니라 **측정 항목**이다. §8의 검증 목록에 포함한다.

### 7.2 선생님 웹

대기실 UI와 호출부가 이미 있고 `delivered:false`를 렌더한다 (`teacher-web/src/screens/Lobby.tsx:33-53`). `reason`별 문구만 늘린다. "등록된 기기가 없어요"와 "알림 서버가 거부했어요"는 선생님이 취할 행동이 다르기 때문이다.

---

## 8. 테스트

### 8.1 서버 (`vitest`가 이미 붙어 있다)

FCM 발송자를 주입 가능한 인터페이스로 두고 가짜 구현으로 대체한다.

- `nudge`: 번호 미매핑 / 기기 없음 / 일부 성공 / 전부 실패 후 토큰 정리 / 종료된 세션 409
- `POST /devices`: 신규 등록 / 같은 토큰 재등록 / 소유자 변경

### 8.2 앱 — FCM 없이도 화면과 전환은 전부 검증된다

호출 액티비티를 인텐트로 직접 띄우면 된다.

```
adb shell am start -n com.wjthinkbig.bookclub3app.bookpad/com.wjthinkbig.bookclub3app.lesson.LessonCallActivity --es session_id <id>
```

이것으로 전체화면 표시, [들어가기], `Screen.Lesson` 전환까지 확인한다. FCM 경로는 그 위에 얹어 별도로 확인한다.

### 8.3 실기기 측정 항목

| 항목 | 확인 방법 |
|---|---|
| 전체화면 인텐트가 실제로 허용되는가 | 알림 표시 형태를 로그와 육안으로 비교 |
| 화면 꺼짐 상태에서 깨어나는가 | 화면 끄고 발송 |
| 앱 종료 상태에서 도착하는가 | 강제 종료 후 발송 |
| 절전 상태에서 지연되는가 | 방치 후 발송, 수신 시각 기록 |

### 8.4 TURN 서버 없이 어디까지 되는가

**이 스펙 전체가 검증된다.** 푸시 발송 → 수신 → 전체화면 → 입장 → 수업 화면 껍데기 전환까지 영상이 필요 없다. 공인 IP TURN 서버가 막고 있는 것은 화상 모듈 스펙의 실제 통화뿐이다.

---

## 9. 열린 이슈

1. **스케줄링 백엔드에 인증이 없다.** `POST /devices`가 열린 쓰기 API가 된다 — 남의 `customerNumber`로 임의의 토큰을 등록할 수 있다. 기존 상태와 일관되지만 운영 전에 반드시 닫아야 한다. 운영자 모니터링 설계 §2.1의 "만드는 것과 띄우는 것은 다르다"가 여기에도 그대로 적용된다.
2. **iOS는 지원하지 않는다.** APNs 인증키가 없고(화면 설계 §12 미해결 이슈), iOS는 `BookPadSessionParams`를 채우는 코드 자체가 없어 `childCustomerNumber`가 항상 더미다.
3. **`USE_FULL_SCREEN_INTENT`의 실제 허용 여부 미확인.** §8.3에서 측정한다.
4. **형제가 한 태블릿을 쓰는 경우의 토큰 소유권.** 현재 정책은 "마지막 등록이 이긴다". 운영 확인이 필요하다.
5. **Firebase 앱 등록과 서비스 계정 키가 외부 의존이다.** 둘 다 확보되기 전에는 발송 경로를 끝까지 검증할 수 없다.

---

## 10. 결정 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| 대상 앱 | 북클럽 앱 (`app-bookclub3-master`) | 아이가 실제로 쓰는 앱이고 `childCustomerNumber`가 여기 있다 |
| 아이 식별자 | `childCustomerNumber` | 앱의 모든 API와 `Customer-Number` 헤더가 이미 이 값을 쓴다 |
| 식별자 영속화 | `UserPreferences`에 저장 | 푸시로 깨어난 앱은 런처 인텐트가 없다 |
| 푸시 채널 | FCM, data-only 고우선순위 | 전체화면 인텐트를 앱이 직접 걸어야 한다 |
| 알림 형태 | 전체화면 시도 + 헤드업 폴백 | Android 14의 전체화면 인텐트 제한 |
| 호출 화면 | 별도 액티비티 | `showWhenLocked`는 액티비티 속성이다 |
| 입장 경로 | 인텐트 액션 `OPEN_LESSON` | 기존 `OPEN_VIEWER` 전례와 동일 |
| Firebase 범위 | `androidMain`만 | iOS 빌드 보호, KMP 공용 코드 오염 방지 |
| 발송 실패 | `reason`으로 구분해 노출 | 화면 설계 §6.1 "조용히 성공한 척하지 말 것" |
| iOS | 이번 범위 밖 | APNs 인증키 미확보, 식별자 미확보 |
