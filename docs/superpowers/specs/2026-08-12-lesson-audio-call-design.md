# 수업 음성 통화 모듈 요건정의 및 설계

- 작성일: 2026-08-12
- 대상: 북클럽 앱의 `com.wjthinkbig.studymeet` 화상 모듈 — 이번 단계는 음성 1:1 통화
- 관련 문서: `2026-08-11-lesson-call-push-design.md` (이하 "호출 설계"), `2026-08-06-studymeet-video-tutoring-design.md` (이하 "본 설계"), `2026-08-07-teacher-lesson-screen-design.md` (이하 "화면 설계")
- 상태: 설계 확정, 구현 계획 대기

---

## 1. 범위 — 소리부터 오간다

호출 설계가 끝나면서 아이는 수업 화면까지 들어온다. 그런데 그 화면은 "연결 준비 중"이라는 글자뿐이다. 선생님과 아이 사이에 오가는 것이 하나도 없다.

이 스펙이 끝났을 때 되는 것은 하나다. **선생님과 아이가 서로의 목소리를 듣는다.**

| 만든다 | 만들지 않는다 |
|---|---|
| `:studymeet` 모듈과 오디오 `PeerConnection` | 카메라·영상 트랙·렌더러 |
| 시그널링 접속과 offer/answer/ICE 교환 | PiP (본 설계 §5.2) |
| 아이가 자기 수업을 조회하는 API | 포그라운드 서비스 (본 설계 §5.1) |
| 마이크 권한·스피커폰 라우팅 | 릴레이 비율 계측 |
| 실패 상태 표시와 재시도 | 재연결·ICE restart (본 설계 §4.3) |
| | iOS |

### 1.1 왜 영상을 빼는가

영상을 함께 넣으면 카메라 수명주기, 렌더러의 `expect/actual` 컴포저블, 화면 회전, 해상도 정책이 한꺼번에 딸려 온다. 그중 어느 것이 문제를 일으키는지 통화 자체가 되기 전에는 가릴 수 없다.

소리만 먼저 오가면 시그널링·ICE·권한·오디오 라우팅이 전부 검증된다. 영상 트랙은 그 위에 얹는 작업이며, 이 스펙에서 만든 `PeerConnection`을 그대로 쓴다.

**대신 감수하는 것:** 아이 입장에서 "얼굴을 보는 수업"이 아직 아니다. 이 상태로는 파일럿을 돌릴 수 없다. 다음 스펙까지가 하나의 제품이다.

---

## 2. 모듈 경계

### 2.1 새 모듈 `:studymeet`

북클럽 프로젝트(`app-bookclub3-master`)의 `settings.gradle.kts`에 세 번째 모듈로 추가한다.

| 항목 | 값 |
|---|---|
| 플러그인 | `com.android.library` |
| 네임스페이스 | `com.wjthinkbig.studymeet` |
| minSdk / compileSdk | 24 / 36 (앱과 동일) |
| 의존성 | `io.github.webrtc-sdk:android:144.7559.09`, OkHttp, kotlinx-coroutines |

WebRTC SDK는 Phase 0 spike에서 검증된 버전 그대로다. 시그널링 WebSocket은 OkHttp를 쓴다 — spike의 `SignalingClient.kt`가 이미 그것으로 동작하고, 그 코드를 옮겨오는 편이 `:shared`의 Ktor 설정에 손대는 것보다 위험이 작다.

**이 모듈에만 WebRTC가 들어간다.** `:shared`도 `composeApp/commonMain`도 libwebrtc를 모른다.

### 2.2 공용 코드에 두는 계약

`:shared/commonMain`에 플랫폼 타입이 하나도 없는 인터페이스를 둔다.

```kotlin
package com.wjthinkbig.bookclub3app.feature.lesson.domain.call

interface LessonCallEngine {
    val state: StateFlow<LessonCallState>
    fun join(signalingUrl: String, room: String, isCaller: Boolean)
    fun setMicEnabled(enabled: Boolean)
    fun leave()
}

sealed class LessonCallState {
    data object Idle : LessonCallState()
    data object Connecting : LessonCallState()
    data object Connected : LessonCallState()
    data class Failed(val reason: FailureReason) : LessonCallState()
}

enum class FailureReason {
    NO_MIC_PERMISSION,
    SIGNALING_UNREACHABLE,
    ICE_FAILED,
    ENGINE_ERROR,
}
```

`LessonComponent`는 이 인터페이스만 안다.

### 2.3 의존 방향

```
composeApp/androidMain ──▶ :studymeet ──▶ libwebrtc, OkHttp
        │
        └──▶ :shared (LessonCallEngine 인터페이스, LessonComponent)
```

`:shared` 는 `:studymeet` 에 의존하지 않는다. 구현체는 `MainApplication`(`composeApp/androidMain`)에서 Koin 에 바인딩한다. iOS 는 `KoinHelper` 에서 아무것도 하지 않는 `NoopLessonCallEngine`(`:shared/commonMain`)을 바인딩해 빌드와 실행이 그대로 유지된다.

### 2.4 모듈 내부 세 조각

| 파일 | 감추는 것 | 밖으로 내보내는 것 |
|---|---|---|
| `SignalingClient` | WebSocket, 메시지 형식 | `onReady`, `onOffer`, `onAnswer`, `onCandidate`, `onPeerLeft` 콜백 |
| `WebRtcAudioSession` | `PeerConnectionFactory`, 오디오 트랙, `PeerConnection`, ICE 후보 버퍼 | `createOffer`, `handleRemote*`, `close`, ICE 상태 콜백 |
| `AndroidLessonCallEngine` | 위 둘의 조립과 순서 | `LessonCallEngine` 구현 |

Phase 0의 `SignalingClient.kt`는 거의 그대로 옮긴다. `WebRtcEngine.kt`는 카메라·`SurfaceViewRenderer`·`getStats` 계측을 걷어낸 오디오 전용으로 줄인다. 릴레이 비율 계측은 이번에 하지 않는다 — TURN 이 없어 셀 것이 없다.

---

## 3. 역할과 방 찾기

### 3.1 caller/callee 충돌을 먼저 없앤다

지금 `GET /sessions/:id/token` 은 누가 부르든 `role: 'caller'` 를 돌려준다. 선생님 웹이 유일한 사용자라 문제가 드러나지 않았을 뿐이다.

아이가 붙는 순간 둘 다 caller 가 되면 offer 가 두 개 날아가 협상이 깨진다. 반대로 둘 다 callee 면 아무 일도 일어나지 않고 **오류 없이** 멈춘다 — 이쪽이 더 찾기 어렵다.

**선생님이 caller, 아이가 callee 로 정한다.** 선생님 웹은 이미 동작이 확인된 쪽이므로 건드리지 않는다.

`signaling/README.md` 는 태블릿을 caller 로 적어 두었다. 그것은 Phase 0 spike 전용 규약이므로 **이 설계가 대체한다.** README 에 그 사실을 적는다.

### 3.2 아이가 자기 방을 찾는 경로

엔드포인트 하나로 두 경우를 모두 처리한다.

```
GET /students/:customerNumber/current-session
GET /students/:customerNumber/current-session?sessionId=<id>
```

응답 한 번에 입장에 필요한 것이 다 온다:

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

| 진입 | 호출 | 서버가 하는 일 |
|---|---|---|
| KRS 버튼 | 인자 없이 | 지금 들어갈 수 있는 수업을 고른다 |
| 푸시 알림 | `sessionId` 를 붙여 | 그 세션의 입장 정보를 준다 |

**"지금 들어갈 수 있는 수업"의 정의** — 선생님 화면의 대기실 창과 같은 규칙을 쓴다.

- `scheduledAt - 5분 <= now` 인 `SCHEDULED`
- `IN_PROGRESS`
- 여러 개면 `scheduledAt` 이 가장 이른 것
- 없으면 `404`

`ENDED` 와 `CANCELLED` 는 제외한다. 편성 설계의 "ENDED +30분 재입장"은 선생님이 메모를 마저 쓰기 위한 규칙이며, 아이를 끝난 수업에 들여보내는 근거가 아니다.

**소유권을 서버가 확인한다.** 두 경우 모두 그 세션이 이 `customerNumber` 의 것인지 검사하고, 아니면 `404` 를 준다 — 남의 방이 존재한다는 사실조차 알려주지 않는다.

이 엔드포인트가 생기면 호출 설계에서 자리를 지키던 `LessonEntry.MANUAL_SESSION_ID` 는 삭제된다.

### 3.3 평문 WebSocket 제약

앱의 `network_security_config.xml` 이 평문을 허용하는 호스트는 `127.0.0.1` 하나뿐이다. 따라서 로컬 검증에서 `signalingUrl` 은 반드시 `ws://127.0.0.1:8081` 이어야 하고, 태블릿은 `adb reverse tcp:8081 tcp:8081` 로 붙는다. `localhost` 라고 적으면 표기가 달라 차단된다.

AWS 배포 후에는 `wss://` 가 되어 이 제약이 사라진다.

---

## 4. 통화 수명주기

| 시점 | 하는 일 |
|---|---|
| 수업 화면 진입 | 입장 정보 조회 → 마이크 권한 확인 → `engine.join(...)` |
| `Connecting` | 시그널링 접속, `ready` 대기, callee 이므로 offer 를 기다린다 |
| `Connected` | ICE 가 연결됨. 소리가 오간다 |
| 화면 파괴 (`doOnDestroy`) | `engine.leave()` |

### 4.1 백그라운드에서 연결을 끊지 않는다

아이가 홈 버튼을 누르거나 알림창을 내렸다고 수업이 끊기는 것은, 잠깐 소리가 비는 것보다 나쁘다. 그래서 백그라운드 전환에 `leave()` 를 걸지 않는다.

**대신 포그라운드 서비스가 없으므로 OS 가 마이크 캡처를 멈춘다.** 아이 목소리만 끊기고 연결과 선생님 소리는 유지된다. 화면으로 돌아오면 마이크가 되살아난다.

이것은 결함이 아니라 이번 범위의 결과다. 없애는 것은 포그라운드 서비스 스펙의 일이다.

### 4.2 오디오 라우팅

스피커폰으로 고정한다. 기본값은 수화부로 잡힐 수 있는데 태블릿을 귀에 대고 쓰지 않는다. `MODIFY_AUDIO_SETTINGS` 권한은 앱에 이미 선언되어 있다.

---

## 5. 실패 처리

조용한 실패를 만들지 않는다. 모든 실패는 화면에 문장으로 나오고 로그에 남는다.

| 지점 | 상태 | 아이에게 보이는 것 |
|---|---|---|
| 조회 404 | — | "지금 들어갈 수업이 없어요" |
| 조회 네트워크 실패 | — | "연결에 실패했어요" + 다시 시도 |
| 마이크 권한 거부 | `NO_MIC_PERMISSION` | "마이크를 켜야 수업에 들어갈 수 있어요" + 권한 다시 요청 |
| 시그널링 접속 실패 | `SIGNALING_UNREACHABLE` | "수업 서버에 연결하지 못했어요" + 다시 시도 |
| ICE 실패 | `ICE_FAILED` | "선생님과 연결하지 못했어요" + 다시 시도 |
| 그 외 | `ENGINE_ERROR` | "문제가 생겼어요" + 다시 시도 |

### 5.1 ICE 실패는 지금 정상적으로 자주 일어난다

TURN 이 없는 동안, 태블릿과 선생님 PC 가 서로 다른 망에 있으면 **ICE 는 반드시 실패한다.** 태블릿은 자기 와이파이(`192.168.15.x`), 선생님 PC 는 사내망(`10.145.164.x`)이고 둘 사이에 경로가 없다.

이것은 버그가 아니라 현재 구성의 결과다. 이 문장을 여기 남기는 이유는, 나중에 `ICE_FAILED` 를 보고 코드를 헛되이 뒤지지 않게 하기 위함이다. 없애는 방법은 §7 의 로컬 TURN 이거나 AWS 배포다.

---

## 6. 테스트

이 저장소들의 관례대로 **순수한 것만 단위 테스트한다.** 라우트와 안드로이드 프레임워크는 테스트 하네스가 없다.

### 6.1 백엔드

"지금 들어갈 수 있는 수업 고르기"를 순수 함수로 분리해 테스트한다.

- 시작 5분 전에 걸린 `SCHEDULED` 를 고른다
- 6분 전이면 고르지 않는다
- `IN_PROGRESS` 를 고른다
- `ENDED` / `CANCELLED` 는 고르지 않는다
- 여러 개면 가장 이른 것
- 다른 아이의 세션은 고르지 않는다
- 후보가 없으면 없음을 돌려준다

### 6.2 모듈

플랫폼에 닿지 않는 두 조각을 클래스로 빼내 테스트한다.

- **시그널링 메시지 코덱** — offer/answer/candidate/ready/peer-left 의 직렬화와 파싱, 모르는 타입 무시
- **ICE 후보 버퍼** — remote description 전에 온 후보를 모았다가 이후에 흘려보내는 규칙. Phase 0 에서 이 규칙이 없어 후보가 조용히 버려진 적이 있다

### 6.3 실기기 음성 확인 — AWS 없이 가능하다

앞선 작업에서 coturn 을 `adb reverse` 로 태블릿에 연결해 TURN 할당이 성공하는 것을 이미 확인했다. 같은 방법을 쓴다.

```
PC 에 coturn 을 평문 3478/TCP 로 기동
adb reverse tcp:3478 tcp:3478
앱의 ICE 서버에 turn:127.0.0.1:3478?transport=tcp 를 추가
선생님 브라우저는 같은 PC 의 coturn 에 직접 붙는다
```

태블릿은 USB 로 TURN 에 붙고 선생님은 로컬에서 붙으므로 **실제로 소리가 오간다.** 서로 다른 망을 넘는 진짜 조건은 AWS 배포 뒤에 다시 잰다.

TURN 자격증명은 `local.properties` 나 `.env` 에 두고 커밋하지 않는다.

---

## 7. 열린 이슈

1. **스케줄링 백엔드에 인증이 없다.** `GET /students/:customerNumber/current-session` 은 회원번호만 알면 그 아이의 수업 정보를 돌려준다. 기존 열린 이슈와 같은 뿌리이며 운영 전에 반드시 닫는다.
2. **서로 다른 망을 넘는 통화는 이 스펙에서 검증되지 않는다.** AWS 개발서버에 시그널링과 TURN 을 올린 뒤 다시 잰다. **2026-08-13 실기기 검증도 이 이슈를 닫지 못한다** — 태블릿은 `adb reverse` 로 USB 를 통해 PC 의 coturn 에 붙었을 뿐, 태블릿의 와이파이(`192.168.15.x`)에서 사내망(`10.145.164.x`)의 coturn 으로 직접 나간 것이 아니다. USB 가 두 망 사이의 실제 경로 부재를 가려 준 것이며, AWS 배포 후 다시 재는 것 외에 이 이슈를 닫을 방법은 없다.
3. **백그라운드에서 아이 마이크가 끊긴다.** 포그라운드 서비스 스펙이 없앤다.
4. **재연결이 없다.** 끊기면 아이가 다시 들어가야 한다. 본 설계 §4.3 의 재연결·ICE restart 는 별도 작업이다.
5. **iOS 는 대상이 아니다.** `NoopLessonCallEngine` 이 자리만 지킨다.
6. **세션 상태를 우회해 재입장시키면 통화가 다시 서지 않는다.** 2026-08-13 검증에서, 정상 흐름(`수업 시작` → `ENDED`)을 거친 뒤 DB 의 `status` 만 `IN_PROGRESS` 로 되돌려 재입장을 시도했더니 태블릿은 "김선생 선생님과 연결 중이에요"에서 멈추다가 `iceConnectionState` 가 `CHECKING`/`CONNECTED` 를 거치지 않고 바로 `CLOSED` 로 떨어졌고, coturn 에도 두 번째 allocation 이 잡히지 않았다. 시그널링 서버 쪽에 이전 연결의 방/소켓 상태가 남아 있어 재입장을 막는 것으로 보인다. 정상적인 `수업 시작`/`수업 종료` 왕복 밖에서 DB 를 직접 바꾸는 방식으로는 재현하지 못했으며, 원인은 이번 검증 범위 밖이다.

### 7.1 2026-08-13 실기기 검증에서 확인된 것

| 항목 | 결과 |
|---|---|
| `iceConnectionState` 가 CONNECTED 에 도달했는가 | 그렇다. 태블릿 로그: `09:58:08.936 CHECKING` → `09:58:09.173 CONNECTED` |
| coturn 로그에 allocation 이 생겼는가 (릴레이를 탔는가) | 그렇다. `838: Global turn allocation count incremented, now 1` (기동 후 838 초 = 약 00:58:04 UTC, ICE CONNECTED 시각과 5 초 이내로 일치) → 통화 종료 시 `947: ... decremented, now 0` |
| 태블릿 화면 전환 | "김선생 선생님과 수업 중이에요" 로 정확히 바뀌었다 (브리프가 기대한 문구와 일치) |
| 선생님 쪽에서 아이 소리가 들리는가 / 아이 쪽에서 선생님 소리가 들리는가 | **확인하지 못했다.** 이 도구로는 소리를 들을 수 없다. `getStats()` 로 오디오 트랙의 `bytesSent`/`bytesReceived` 증가를 재려 했으나, `RTCPeerConnection` 을 계측하려던 시점에 브라우저 JS 실행 도구가 권한 분류기에 의해 차단되어 실패했다 — 이후 재시도도 계속 차단됨. 따라서 바이트 단위의 미디어 흐름 증거는 얻지 못했고, 얻은 것은 ICE 상태 전이(위)와 coturn allocation(위)뿐이다 |
| 마이크 끄기·켜기가 상대에게 반영되는가 | **확인하지 못했다.** CONNECTED 구간(09:58:09 ~ 09:59:40, 약 91 초)에 화면 캡처와 텍스트 확인을 우선하다가 마이크 토글을 누르지 못한 채 통화가 끝났다. 태블릿 화면에 "마이크 끄기" 버튼 자체는 존재를 확인했다 (스크린샷 상 노출됨) |

**검증 중 발생한 부수 사건 (참고용):** teacher-web 의 `수업 종료` 버튼을 실수로 눌러 세션을 `ENDED` 로 만들었다. 이후 §7-6 에 적은 대로 DB 를 통한 재입장 시도는 실패했고, 최종적으로 세션은 `ENDED` 로 남겨 두었다 — 이는 최초의 정상 흐름 결과와 같다.

---

## 8. 결정 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| 이번 범위 | 음성만 | 통화가 되는지부터 가린다. 영상은 이 `PeerConnection` 위에 얹는다 |
| 모듈 형태 | 안드로이드 라이브러리 `:studymeet` | 요구된 모듈 이름을 지키면서 WebRTC 를 한 곳에 가둔다 |
| 공용 계약 | `LessonCallEngine` 인터페이스 | `:shared` 가 libwebrtc 를 모르게 한다. iOS 빌드 보호 |
| WebRTC SDK | `io.github.webrtc-sdk:android:144.7559.09` | Phase 0 에서 검증된 버전 |
| 시그널링 클라이언트 | OkHttp WebSocket | spike 코드가 이미 동작한다 |
| 역할 | 선생님 caller, 아이 callee | 동작이 확인된 쪽을 건드리지 않는다 |
| 방 찾기 | `GET /students/:customerNumber/current-session` | KRS 버튼과 푸시 두 경로를 한 엔드포인트로 |
| 백그라운드 | 연결 유지, 마이크만 끊김 | 수업이 끊기는 것보다 낫다 |
| 오디오 출력 | 스피커폰 고정 | 태블릿을 귀에 대지 않는다 |
| 로컬 음성 검증 | coturn + `adb reverse tcp:3478` | AWS 를 기다리지 않고 소리를 확인한다 |
