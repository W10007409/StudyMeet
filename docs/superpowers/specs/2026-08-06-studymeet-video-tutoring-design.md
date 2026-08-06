# StudyMeet — 화상 1:1 튜터링 서비스 요건정의 및 설계

- 작성일: 2026-08-06
- 대상: 북클럽 플랫폼 내 화상 학습 모듈 (1단계는 독립 앱으로 개발)
- 상태: 설계 확정, Phase 0 PoC 착수 대기

---

## 1. 배경과 목표

북클럽 플랫폼에 아이와 선생님이 화상으로 함께 책을 보며 공부하는 서비스를 추가한다.

핵심 요구는 **수업이 진행되는 동안 화상 연결이 끊기지 않는 것**이다. 아이가 홈 버튼을 눌러 다른 앱으로 나가더라도 PIP(Picture-in-Picture) 모드로 화상을 유지해야 하며, 선생님은 아이의 이탈을 즉시 알 수 있어야 한다.

학습 화면 자체는 별도 프로젝트에서 개발 중이므로, 본 프로젝트에서는 통합 지점을 검증할 수 있는 최소 가안만 만든다.

### 1.1 제품 파라미터

| 항목 | 값 |
|---|---|
| 수업 형태 | 1:1 튜터링 (선생님 1 : 학생 1) |
| 1회 수업 시간 | 10분 |
| 최대 동시 수업 | 3,000개 방 (참가자 6,000명) |
| 선생님 규모 | 실제 사람 약 3,000명 |
| 수업 녹화 | 하지 않음 |
| 지원 기기 | 태블릿 전용 (Android 태블릿, iPad) |
| 기기 소유 | 개인 소유(BYOD) |
| 화면 방향 | 가로 고정 |
| 앱 형태 | 1단계 독립 앱 → 2단계 북클럽 앱에 모듈로 이식 |

---

## 2. 기술 선정

### 2.1 구루미(Gooroomee) 배제 결정

당초 사내 표준 화상 솔루션인 구루미 사용을 전제로 검토했으나, 조사 결과 다음과 같은 결정적 제약이 확인되어 배제한다.

**조사 결과 (https://gooroomee.readme.io 기준)**

- 구루미는 Android/iOS 모두 **네이티브 SDK를 제공하지 않으며 WebView 전용**이다.
  - Android: WebView + User-Agent에 `BizAOSWebviewApp` 추가 + `WebChromeClient.onPermissionRequest` + JS 브릿지 `aoscall`
  - iOS: WKWebView + `BizWebviewApp` + `WKScriptMessageHandler` 이름 `ioscall`, iOS 14.3+
- 서버 API로 방 생성 후 OTP 참여 URL을 발급하며, URL에 `join=true` 파라미터가 필수다.
- 웹→앱 메시지는 `/room/exit` 계열만 문서화되어 있고, **앱→웹 제어 API(음소거, 카메라 off, 레이아웃 변경)는 공식 문서에 없다.**

**배제 사유**

1. **iOS PIP 불가.** iOS에서 화상통화 PIP는 `AVPictureInPictureController`에 원격 영상 레이어(`AVSampleBufferDisplayLayer`)를 넘겨야 동작한다. WKWebView 내부 WebRTC 스트림은 이 컨트롤러에 넘길 수 없다. 즉 본 프로젝트의 핵심 요건인 "홈 버튼 이후 화상 유지"를 iOS에서 달성할 수 없다.
2. **트랙 세밀 제어 불가.** 학습 중 촬영 활동을 위해 카메라를 전환하거나 트랙을 일시 정지해야 하는데, 앱→웹 제어 API가 없어 `evaluateJavascript`로 DOM을 조작하는 비공식 방식에 의존해야 한다.
3. **KMP 부적합.** WebView 기반은 공유 코드로 추상화하기 어렵다.

### 2.2 LiveKit 채택

| 항목 | 구루미(WebView) | LiveKit(네이티브 SDK) |
|---|---|---|
| Android PIP + 카메라 유지 | 가능하나 웹 UI가 축소 시 붕괴 | 완전 제어. PIP에 원격 렌더러만 배치 |
| iOS PIP + 카메라 유지 | 불가 | 가능 (`AVPictureInPictureController` 경로) |
| 트랙 제어 | 비공식 우회 | `switchCamera()` 등 정식 API |
| 학습 화면 동기화 | 별도 채널 필요 | DataChannel 내장 |
| KMP 적합성 | 낮음 | Android는 Kotlin SDK 직결, iOS는 Swift 주입 |
| 호스팅 | 벤더 종속 | OSS. Cloud/셀프호스팅 선택 자유 |

**대안 검토**: Agora, Zoom Video SDK, Amazon Chime SDK 모두 네이티브 SDK를 제공하므로 PIP 요건은 충족한다. 그러나 DataChannel로 학습 화면 동기화까지 함께 태우는 확장성과 자체 호스팅 자유도에서 LiveKit이 우위다. 또한 LiveKit Cloud와 셀프호스팅의 API가 동일해, PoC는 Cloud로 빠르게 진행하고 운영은 셀프호스팅으로 앱 코드 변경 없이 이관할 수 있다.

### 2.3 P2P 대신 SFU를 쓰는 이유

1:1 통화는 이론상 P2P 직결이 가능하며 서버 대역폭을 크게 절약한다. 그러나 다음 이유로 SFU를 택한다.

- 동시 3,000방 규모에서 SFU 하행은 약 2.7 Gbps(360p 기준)로, P2P 대비 절감액이 국내 정액 회선 기준 월 수백만 원 수준에 그친다.
- P2P를 직접 구현하려면 시그널링 서버, ICE/TURN 관리, 재연결, 대역폭 적응, 네트워크 전환(WiFi↔LTE) 처리를 모두 만들어야 한다. 개발·운영 비용이 절감액을 초과한다.
- 향후 학부모 참관이나 관리자 모니터링이 추가되면 1:1 전제가 깨진다. SFU면 코드 변경 없이 수용된다.
- 녹화를 하지 않기로 하면서 P2P의 최대 단점(서버측 녹화 불가)은 사라졌으나, 동시에 P2P를 택할 유인도 함께 사라졌다.

---

## 3. 시스템 구성

```
[아이 태블릿 앱]  <--SRTP / DataChannel-->  [LiveKit SFU]  <-->  [선생님 앱/웹]
       |                                          |
       | REST (토큰 발급, 준비상태 보고, 사진 업로드) | Webhook (입퇴장, 연결끊김)
       v                                          v
                 [북클럽 백엔드 + StudyMeet 서비스]
```

### 3.1 인프라 규격

```
[LB]
  └─ [LiveKit SFU × 3 노드 (+예비 1, N+1)]  <-->  [Redis: 방 라우팅]
       └─ [TURN over TLS 443]   학교·공공 와이파이 방화벽 대응. 필수
[백엔드]
  ├─ JWT 발급 (방ID, 역할, 권한)
  ├─ Webhook 수신 (participant_joined / participant_disconnected)
  └─ 학생 준비상태 조회 API (운영·선생님용)
```

**대역폭 산정**

| 화질 | 참가자당 | 3,000방 피크 하행 |
|---|---|---|
| 360p24 (기본) | 0.45 Mbps | 약 2.7 Gbps |
| 480p24 (상한) | 0.6 Mbps | 약 3.6 Gbps |
| 720p30 (미채택) | 1.5 Mbps | 약 9 Gbps |

1:1 튜터링은 얼굴 확인이 목적이므로 **기본 360p, 상한 480p**로 캡을 둔다. 화질은 서버 설정으로 분리해 나중에 조정 가능하게 한다.

**호스팅 권고**: 이 규모에서는 아웃바운드 트래픽 비용이 인스턴스 비용을 압도한다. AWS 종량 과금(GB당)으로는 월 1천만 원대까지 발생할 수 있으므로, **국내 IDC 또는 NCP의 정액 대역폭**을 권장한다. LiveKit Cloud는 참가자-분 과금 구조상 이 규모에서 비용이 성립하지 않으므로 PoC 용도로만 사용한다.

**부하 특성**

- 방 회전율: 3,000방 ÷ 600초 = 초당 약 5개 방 생성/파기
- 썬더링 허드: 정각 동시 접속 문제는 **시작 5분 전 대기실 오픈**으로 분산한다.
- 토큰은 사전 발급하고, 시그널링 서버는 수평 확장한다.

---

## 4. 수업 라이프사이클

### 4.1 상태 전이

```
IDLE
 └→ LOBBY (수업 시작 5분 전 오픈)
     └→ PRECHECK (무음 3초: 권한·기기·대역폭 확인)
         └→ CONNECTING
             └→ IN_CLASS
                  ↕  PIP / SCREEN_OFF / RECONNECTING
                  └→ ENDED
```

### 4.2 이탈 상태 모델

선생님 화면에 그대로 노출되는 4개 상태.

| 상태 | 조건 | 카메라 | 선생님이 보는 것 |
|---|---|---|---|
| `IN_CLASS` | 앱 전경, 학습화면 표시 중 | 송출 | 정상 |
| `PIP` | 홈 버튼으로 축소창 진입 | **송출 유지** | 🟡 "다른 화면 보는 중 00:15" (경과 타이머) |
| `SCREEN_OFF` | 전원 버튼 / 화면 꺼짐 | **중단** | 🟠 "자리비움" + 오디오만 |
| `DISCONNECTED` | 앱 종료 또는 네트워크 끊김 | 중단 | 🔴 "연결 끊김 00:08" + 재접속 대기 |

`SCREEN_OFF`에서 카메라를 의도적으로 중단한다. 기술적으로는 유지 가능하지만, 화면이 꺼진 상태에서 촬영을 계속하는 것은 아동 사생활 침해로 읽힌다. 오디오는 유지하여 선생님이 음성으로 복귀를 유도할 수 있게 한다.

### 4.3 이탈 통보 경로 (2중화)

| 경로 | 대상 상태 | 지연 |
|---|---|---|
| **LiveKit DataChannel** | `PIP`, `SCREEN_OFF` — 연결이 살아있는 경우 | 100ms 이하 |
| **LiveKit Webhook → 백엔드 → 선생님 푸시/WS** | `DISCONNECTED` — 앱이 죽어 직접 전송 불가 | 1~2초 |

두 경로 중 하나만 쓰면 반드시 구멍이 생긴다. 반드시 함께 구현한다.

### 4.4 입장

- 방은 **수업 시작 5분 전**부터 열린다(대기실).
- 대기실에서 무음 프리체크를 수행하고, 실패 시 운영/선생님 쪽에 즉시 노출되어 유선 안내가 가능하다.
- 이 정책은 정각 동시 접속 부하를 5분에 걸쳐 분산하는 효과도 함께 갖는다.

### 4.5 종료

- **선생님의 종료 버튼이 유일한 정상 종료 경로**다. 시간 기반 자동 종료는 하지 않는다.
- 안전장치 2개:
  - **하드 타임아웃 30분** — 선생님이 종료를 누르지 않고 이탈한 경우 서버가 강제 종료
  - **선생님 연결 소실 90초** — Webhook `participant_disconnected` 이후 90초 미복귀 시 자동 종료 및 아이에게 안내

### 4.6 시간 표시

- **아이 화면에는 시간 관련 UI를 두지 않는다.** 남은 시간 표시는 어린 학습자에게 압박으로 작용한다.
- 선생님 화면에만 정확한 경과/잔여 시간을 표시한다.
- 선생님 화면에 **누적 끊김 시간**을 별도 표시한다(예: `끊김 누적 1:24`). 시간 보상은 선생님 재량이므로, 시스템은 타이머를 조작하지 않고 판단 근거만 제공한다.

### 4.7 네트워크 장애 처리

| 상황 | 정책 |
|---|---|
| 짧은 끊김 (~10초) | 자동 재연결. 아이 화면에는 최소 안내만. 수업 시간 계속 흐름 |
| 중간 끊김 (10~60초) | 양쪽에 명확한 안내 표시. 누적 끊김 시간에 가산 |
| 긴 끊김 (60초+) | 아이만 끊긴 경우 선생님 대기 화면 + 유선 연락 트리거 |
| WiFi ↔ LTE 전환 | LiveKit ICE restart로 자동 복구 |

재예약·환불 등 운영 정책은 현재 정의된 것이 없다. 시스템은 사실 기록(끊김 구간, 누적 시간)만 남기고, 판단은 선생님·운영에 위임한다.

---

## 5. 화상 유지 구현 (핵심)

### 5.1 Android

**Manifest**

```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"/>

<activity
    android:name=".ClassActivity"
    android:supportsPictureInPicture="true"
    android:resizeableActivity="true"
    android:screenOrientation="landscape"
    android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation" />

<service
    android:name=".ClassForegroundService"
    android:foregroundServiceType="camera|microphone" />
```

**동작 순서**

1. 수업 시작 시점(앱이 포그라운드일 때) **먼저** `foregroundServiceType="camera|microphone"` 서비스를 기동한다.
   - Android 12+ 는 백그라운드에서 FGS 시작이 제한되므로, PIP 진입 후에 기동하려 하면 실패한다. 반드시 선기동.
   - Android 14+ 는 해당 FGS 타입에 대응하는 권한이 미리 승인되어 있어야 한다.
2. `onUserLeaveHint()` 에서 `enterPictureInPictureMode()` 호출. `PictureInPictureParams`에 고정 종횡비를 설정한다(가로 고정이므로 계산이 단순하다).
3. `onPictureInPictureModeChanged(true)` 에서 UI를 전환한다. 학습 화면을 숨기고 **선생님 원격 영상만** 렌더한다.
4. PIP 창에 `RemoteAction`으로 **[수업으로 돌아가기]** 버튼을 제공한다.
5. 화면 꺼짐을 감지하면 카메라 트랙을 비활성화하고 오디오만 유지한다(`SCREEN_OFF` 상태).

### 5.2 iOS / iPadOS

**태블릿 전용 정책이 iOS 제약을 결정적으로 완화한다.** iPadOS 16+ 의 `AVCaptureSession.isMultitaskingCameraAccessSupported` 는 앱이 Split View / Stage Manager / PiP 상태일 때 카메라 캡처를 유지할 수 있게 한다. iPhone에는 없는 iPad 전용 기능이다.

```
Info.plist  Background Modes: audio, voip
            NSCameraUsageDescription, NSMicrophoneUsageDescription

AVAudioSession: category .playAndRecord, mode .videoChat

// 카메라 — iPad 멀티태스킹 접근
if capturer.isMultitaskingAccessSupported {
    capturer.isMultitaskingAccessEnabled = true
}

// PiP — 원격 영상 레이어
videoView.renderMode = .sampleBuffer
let layer = videoView.avSampleBufferDisplayLayer
AVPictureInPictureController(
    contentSource: .init(activeVideoCallSourceView:contentViewController:))
canStartPictureInPictureAutomaticallyFromInline = true   // 홈 스와이프 시 자동 PiP
```

- 지원 iPad 모델이 한정되므로 **반드시 런타임에 `isMultitaskingAccessSupported`로 확인**한다.
- 미지원 기기는 `SCREEN_OFF`와 동일하게 **오디오만 유지**로 폴백한다.

**LiveKit Swift SDK 2.16.0 소스 확인 결과 (2026-08-06).** 당초 이 항목을 프로젝트 최대 리스크로 잡았으나, 필요한 것이 모두 **공개 API로 이미 제공된다**:

| 필요한 것 | 제공 여부 | 위치 |
|---|---|---|
| `AVCaptureSession` 접근 | 제공 — `CameraCapturer.captureSession` (public) | `Track/Capturers/CameraCapturer.swift:91` |
| iPad 멀티태스킹 카메라 접근 | 제공 — `isMultitaskingAccessSupported` / `isMultitaskingAccessEnabled` (getter+setter) | 같은 파일 `:52`, `:63` |
| PiP용 `AVSampleBufferDisplayLayer` | 제공 — `VideoView.avSampleBufferDisplayLayer` (public) | `Views/VideoView.swift:231` |
| 해당 렌더러 선택 | 제공 — `VideoView.renderMode = .sampleBuffer` | `Views/VideoView.swift:57-61` |

SDK 포크나 커스텀 `VideoCapturer` 구현은 **필요 없다.** 남은 iOS 작업은 `AVPictureInPictureController`를 그 레이어에 연결하는 앱 측 배선뿐이다.

### 5.2.1 raw WebRTC 직접 구현 대안을 기각한 근거

LiveKit을 걷어내고 libwebrtc로 P2P를 직접 구현하는 안을 검토했다. 유일한 결정적 장점은 `AVCaptureSession`을 온전히 소유해 iPad 카메라 유지를 SDK 사정과 무관하게 보장할 수 있다는 점이었는데, 위 확인으로 그 장점이 사라졌다.

반면 raw WebRTC를 택하면 다음을 전부 직접 만들어야 한다: **시그널링 서버**(WebRTC에 포함되지 않음), **TURN 운영**(어차피 필요하므로 절감 없음), **재연결과 ICE restart**, **WiFi↔LTE 전환 처리**, **대역폭 적응**, **오디오 라우팅·기기 관리**(Android/iOS 각각).

10분 수업에서 1분 끊기면 수업의 10%가 날아간다. 아이 태블릿은 네트워크 전환이 잦은 환경이고, 재연결은 raw WebRTC에서 가장 손이 많이 가면서 가장 자주 실패하는 영역이다. 그 부분을 검증된 구현에서 자체 구현으로 바꾸는 것은 손해다. **SFU 경유로 남는 대역폭 비용(약 2.7 Gbps)이 그 대가로 지불할 가치가 있다.**

### 5.3 다른 앱 사용 차단

BYOD(개인 소유 기기)이므로 Device Owner 키오스크 모드는 사용할 수 없다.

| 강도 | Android 태블릿 | iPad |
|---|---|---|
| 완전 차단 | 불가 (BYOD) | 불가 (BYOD) |
| 준차단 | **화면 고정 `startLockTask()`** — 수업 시작 시 [집중 모드] 버튼으로 진입. 해제하려면 뒤로+개요 길게 누르기 | 없음 (스크린타임 API는 별도 entitlement 승인과 보호자 설정이 필요해 1차 범위 제외) |
| 감지·통보 | `onUserLeaveHint`, 라이프사이클 | `didEnterBackground` |

- 아이가 [집중 모드]를 거부해도 **수업은 정상 진행**한다.
- 차단은 보조 수단일 뿐이며, **실질적으로 가장 강한 통제는 "선생님이 이탈을 즉시 알고 이름을 부르는 것"**이다. 설계 투자는 이탈 감지·통보·복귀 편의성에 집중한다.

**사용 금지 기술**

- `AccessibilityService`를 이용한 앱 전환 감시 — Google Play 정책 위반, 심사 반려 확정
- `UsageStatsManager`로 "어떤 앱을 켰는지" 조회 — 아동 대상 앱에서 심사·여론 리스크가 크다

원칙: **"무슨 앱을 켰는지"는 보지 않고, "우리 앱을 떠났다"만 감지한다.**

---

## 6. 카메라 중재 (Camera Arbiter)

학습 중 촬영 활동이 존재하므로, 화상 트랙과 학습 촬영이 각자 카메라를 열면 충돌한다. **카메라 하드웨어의 단일 소유자**를 두고 모든 접근을 중재한다.

```
CameraArbiter  (KMP expect/actual)
  요청자: VIDEO_CLASS(LiveKit) | STUDY_CAPTURE(학습 활동)
  상태:   FRONT_CLASS / BACK_SHARED / CAPTURE_PAUSED / DUAL
  상태 전이 시 → LiveKit DataChannel로 선생님에게 브로드캐스트
```

### 6.1 동작 모드 (기기 능력에 따라 자동 폴백)

| 모드 | 조건 | 동작 | 화상 끊김 |
|---|---|---|---|
| `DUAL` | 동시 카메라 지원 기기 (Android `getConcurrentCameraIds`, iPad `AVCaptureMultiCamSession`) | 전면=화상, 후면=촬영 | 없음 |
| **`BACK_SHARED`** (기본) | 전 기기 | LiveKit 트랙을 후면 카메라로 전환. 아이가 비추는 것을 **선생님도 함께 본다** | 없음 |
| `CAPTURE_PAUSED` | 고해상도가 필수인 경우 | 트랙 일시 중단 → 고해상도 촬영 → 재개 | 1~2초 |

### 6.2 촬영 플로우

촬영은 **학습 중 아이가 화면의 버튼을 눌러** 시작한다.

```
아이: [📷 사진 찍기] 탭
  → 화면 전체가 후면 카메라 뷰파인더로 전환
  → 선생님 화면에도 동일 화면 + "○○이가 사진 찍는 중" 배지
  → 선생님: "조금만 위로! 그래 좋아, 찍어!"        (실시간 코칭)
  → [찰칵] → 결과 미리보기 → [다시] / [완료]
  → 전면 카메라로 자동 복귀, 수업 계속
```

촬영 중 선생님이 아이 화면을 함께 보는 것은 결함이 아니라 **기능**으로 설계한다. 10분 튜터링에서 상호작용이 가장 살아나는 구간이다.

### 6.3 사진 저장·전송 정책

- 촬영 결과는 **앱 전용 저장소(scoped storage / app sandbox)에만 기록**한다.
  - Android `READ_MEDIA_IMAGES` / `WRITE_EXTERNAL_STORAGE` 불필요
  - iOS `NSPhotoLibraryAddUsageDescription` 불필요
  - 결과적으로 **아이가 추가 권한 다이얼로그를 다시 만나지 않는다.** 갤러리 저장 기능은 권한을 하나 더 늘리므로 넣지 않는다.
- 업로드 성공 시 로컬 원본을 즉시 삭제한다.
- 업로드 실패 시 재시도 큐에 넣고, **24시간 내 미전송이면 로컬에서 자동 파기**한다.
- 서버 보관 기간: **수강 종료 +30일 파기 권장** (오픈 이슈, §11 참조).
- 전송은 TLS, 저장은 암호화. 접근 권한은 담당 선생님·본인·보호자로 한정.
- 후면 카메라가 기본이므로 아이 얼굴이 우발적으로 촬영될 확률이 낮다. 개인정보 측면의 부수적 이점이다.

---

## 7. 온보딩과 권한

BYOD이고 아이가 스스로 설정해야 하므로, **권한 거부가 최대 리스크**다.

- iOS는 한 번 거부하면 앱에서 재요청이 불가능하다(설정 앱으로 이동해야 함).
- Android 11+ 는 두 번 거부하면 자동으로 영구 거부 처리된다.

따라서 "거부를 되돌리는 UX"보다 **"애초에 거부하지 않게 하는 UX"**에 투자한다.

### 7.1 「수업 준비실」 리허설 (첫 수업 전 1회)

캐릭터가 진행하는 미션 4개. 각 미션이 권한 1개와 1:1로 대응한다.

| 미션 | 아이가 하는 것 | 실제 동작 | 성공 판정 |
|---|---|---|---|
| 1. 얼굴 | "네 얼굴이 보이면 성공!" | 카메라 권한 요청 | 프리뷰에 영상 표시 |
| 2. 목소리 | "'안녕하세요' 크게 말해봐!" | 마이크 권한 요청 | 볼륨 막대가 기준선 초과 |
| 3. 귀 | "선생님 목소리 들려?" 샘플 재생 | 스피커·볼륨 확인 | [들려요] 탭 |
| 4. 인터넷 | 자동 (로딩 애니메이션) | 연결 테스트 + 대역폭 측정 | 임계 통과 |

완료 시 스탬프/배지를 부여하고 수업 입장 버튼을 활성화한다.

### 7.2 프라이밍 (필수)

시스템 권한 다이얼로그를 띄우기 **전에 반드시** 설명 화면을 먼저 보여준다.

```
[일러스트: 아이와 선생님이 화면 너머로 손 흔드는 그림]
"카메라를 켜면 선생님이 네 얼굴을 볼 수 있어!"
                [준비됐어요]     ← 이 버튼을 눌러야 시스템 다이얼로그 노출
```

프라이밍 없이 다이얼로그를 바로 띄우면 거부율이 크게 상승한다. 기회가 사실상 한 번뿐이므로 반드시 지킨다.

### 7.3 거부 복구

1. **1차 거부** → 캐릭터 리액션("앗, 그러면 선생님이 널 못 봐") + 이유 설명 후 재요청. Android는 여기가 마지막 기회다.
2. **영구 거부** → **선생님이 유선으로 안내**한다.
   - 이를 위해 백엔드에 **학생 준비상태 조회 API**가 필요하다. 운영·선생님 화면에 "준비 실패" 목록이 실시간으로 노출되어야 전화 대상을 특정할 수 있다.

### 7.4 권한 없이도 수업은 진행된다

**수업 자체를 막지 않는다.** 카메라 권한이 없으면 오디오와 학습 화면만으로 수업을 진행하고, 선생님 영상은 아이에게 단방향으로 보여준다. 10분 튜터링은 이 상태로도 성립한다.

### 7.5 매 수업 전 프리체크

대기실에서 **무음 3초 프리체크**를 수행한다(권한·기기 상태만 확인). 실패한 경우에만 전체 리허설을 재실행한다.

---

## 8. 화면 설계

**태블릿 가로 고정.** 가로 고정은 PIP 종횡비 계산을 단순화하고, 회전 중 WebRTC 트랙 재협상 이슈를 제거하며, 개발·QA 범위를 절반으로 줄인다.

### 8.1 적응형 레이아웃

```
기본:      [ 학습화면 70% ][ 선생님 30% ]
[크게 보기] 탭 → [ 학습화면 100% ] + 선생님이 모서리 플로팅 카드로 전환
선생님이 말하기 시작 → 플로팅 카드가 자동으로 살짝 확대
```

- **로컬 프리뷰(내 얼굴)는 표시하지 않는다.** 아이가 자기 얼굴을 보면 산만해진다. 카메라가 켜져 있다는 작은 인디케이터만 둔다.
- 아이 화면에 시간 관련 UI를 두지 않는다(§4.6).

### 8.2 PIP 창

PIP 진입 시에는 **선생님 원격 영상만** 렌더한다. 학습 화면은 숨긴다. PIP 상태에서는 학습이 진행되지 않으며, 선생님도 그 사실을 배지로 인지한다.

---

## 9. 학습 화면 가안

실제 학습 화면은 다른 프로젝트에서 개발 중이다. 본 프로젝트의 가안은 **통합 지점을 전부 실동작 검증할 수 있는 최소 세트**로 한정한다.

| 기능 | 검증 대상 |
|---|---|
| 책 지면 이미지 뷰어 + 페이지 넘김 | 학습 화면 자리 확보 |
| **선생님-아이 페이지 동기화** | LiveKit DataChannel |
| **선생님 포인터** (선생님이 짚으면 아이 화면에 원 표시) | DataChannel 실시간성 |
| **📷 사진 찍기 버튼** | Camera Arbiter 전 경로 |
| 간단 퀴즈 1개 | 학습 상호작용 자리 확보 |

이 5개로 PIP · 카메라 중재 · DataChannel · 이탈 감지가 모두 검증된다. 더 넣으면 낭비이고, 덜 넣으면 검증이 되지 않는다.

실제 학습 화면으로의 교체에 대비해 **"학습 컨텐츠 슬롯" 인터페이스**로 추상화한다. 나중에 학습 화면이 웹으로 오더라도 슬롯 구현체만 교체하면 된다.

### 9.1 DataChannel 메시지 스키마 (초안)

| 메시지 | 페이로드 | 방향 |
|---|---|---|
| `presence` | `{ state, since }` | 아이 → 선생님 |
| `page_sync` | `{ pageNo }` | 양방향 |
| `pointer` | `{ x, y, action }` | 선생님 → 아이 |
| `camera_state` | `{ mode: FRONT_CLASS \| BACK_SHARED \| CAPTURING }` | 아이 → 선생님 |
| `capture_done` | `{ assetId }` | 아이 → 선생님 |

---

## 10. KMP 아키텍처

```
:shared  (commonMain, Compose Multiplatform)
   domain/    수업 세션 상태머신, 이탈 상태 모델, 카메라 중재 정책, 대기실 로직
   data/      Ktor 클라이언트(토큰 발급, 준비상태 보고, 사진 업로드),
              DataChannel 메시지 스키마
   ui/        대기실 · 리허설 온보딩 · 학습화면 가안 · 수업 화면
   expect/    VideoEngine · CameraArbiter · PipController
              · PermissionController · AppLockController

:androidApp
   actual = LiveKit Android SDK, Activity PIP, ForegroundService(camera|microphone),
            startLockTask(화면 고정), CameraX

:iosApp (Swift)
   actual = LiveKit Swift SDK, AVPictureInPictureController,
            AVCaptureSession(isMultitaskingCameraAccessEnabled), AVAudioSession
```

### 10.1 알려진 제약

**LiveKit Swift SDK는 Swift 전용이라 Kotlin/Native가 직접 소비할 수 없다** (cinterop은 Objective-C까지만 지원). 해결 방법은 KMP 표준 패턴을 따른다: `:shared`에 Kotlin `interface`를 정의하고, Swift 쪽에서 이를 구현한 뒤 앱 시작 시 주입한다.

이로 인해 **iOS에는 상당량의 Swift 네이티브 코드가 발생**한다(PiP 구현 + 카메라 세션 관리 + LiveKit 래핑). "KMP를 쓰니 iOS는 공짜"가 아니라는 점을 일정 산정에 반영한다. (합의 완료)

### 10.2 북클럽 이식 대비

1단계는 독립 앱이지만 2단계에 북클럽 앱의 모듈로 이식된다. 따라서:

- 화상 기능 일체를 **독립 Feature 모듈**로 구성한다.
- 호스트 앱 의존성(로그인 세션, 유저 정보, 방 ID, 동의 여부)은 **인터페이스로 주입**받는다. 모듈이 직접 인증하지 않는다.
- 권한·PIP·FGS 선언은 **모듈 Manifest에 두어 병합**되도록 한다.

### 10.3 기존 프로젝트 구조 변경

현재 `C:\Project\Android\StudyMeet`는 순수 Android Gradle 프로젝트다(Kotlin, View 시스템, minSdk 26, targetSdk 36, 소스 없음). KMP + Compose Multiplatform 구조로 재구성한다. 기존 코드가 사실상 없으므로 마이그레이션 부담은 없다.

---

## 11. 리스크와 Phase 계획

### 11.1 Phase 0 — PoC 스파이크 (최우선)

아래 항목이 깨지면 설계가 바뀐다. 다른 작업보다 먼저 검증한다.

| # | 검증 항목 | 상태 | 실패 시 대응 |
|---|---|---|---|
| 1 | **iPad에서 `isMultitaskingAccessEnabled`로 PiP 중 카메라 유지**. 여러 세대 실기기 필요 | 미검증 — iPad 필요 | iPad는 오디오만 유지로 확정 |
| 2 | **Android 14/15/16에서 PIP + FGS(camera) 동작**. 삼성 태블릿 OEM 차이 포함 | 미검증 — 태블릿 필요. 스파이크 코드는 완성 | PIP 정책 재설계 |
| 3 | ~~LiveKit Swift SDK 위 PiP 직접 구현 난이도~~ | **해소됨 (2026-08-06)** — §5.2 참조. 필요한 API가 전부 공개 제공됨 | — |
| 4 | 동시 3,000방 부하 | 미검증 | 노드 증설 / 화질 하향 |
| 5 | **포그라운드 서비스가 실제로 필요한지** — PIP는 visible 상태라 FGS 없이도 카메라가 유지될 수 있다. FGS를 제거한 빌드로 대조 측정해야 §5.1의 전제가 검증된다 | 미검증 | FGS 불필요로 판명되면 §5.1 단순화 |

> 항목 5는 Phase 0 계획을 쓸 때 빠뜨렸다가 최종 리뷰에서 드러났다. 항목 2가 통과해도 그것이 "FGS 덕분"이라는 증거는 아니다.

### 11.2 Phase 계획

| Phase | 내용 |
|---|---|
| 0 | PoC 스파이크 (§11.1) |
| 1 | KMP 골격 + LiveKit 1:1 통화 |
| 2 | PIP + 이탈 감지 + 선생님 실시간 통보 |
| 3 | 리허설 온보딩 + 대기실 |
| 4 | Camera Arbiter + 사진 촬영 |
| 5 | 학습화면 가안 + DataChannel |
| 6 | 부하 테스트 + 셀프호스팅 인프라 구축 |

---

## 12. 오픈 이슈

| # | 항목 | 담당/확인처 |
|---|---|---|
| 1 | 북클럽 가입 동의 항목에 **"실시간 영상·음성 처리"**가 포함되어 있는지. 미포함이면 별도 동의 화면이 온보딩 앞에 추가되어야 한다 | 북클럽 가입 플로우 팀 / 법무 |
| 2 | 촬영 사진의 서버 **보관 기간 30일** 안 확정 | 법무 / 개인정보 담당 |
| 3 | **선생님 앱/웹의 존재 형태** — 본 프로젝트 범위인지, 별도 프로젝트인지 | 미정 |
| 4 | 실제 학습 화면의 기술 스택(웹/네이티브) — 슬롯 인터페이스 설계에 영향 | 학습 화면 개발팀 |
| 5 | 끊김 장기화 시 **재예약·환불 운영 정책** — 현재 정의 없음. 시스템은 사실 기록만 남긴다 | 운영 |

---

## 13. 결정 요약

| 항목 | 결정 |
|---|---|
| 화상 솔루션 | **LiveKit** (구루미 배제 — WebView 전용이라 iOS PIP 불가) |
| 미디어 토폴로지 | **SFU** (P2P 미채택) |
| 호스팅 | PoC는 LiveKit Cloud, 운영은 **국내 셀프호스팅** |
| 화질 | 기본 360p, 상한 480p |
| 앱 스택 | **KMP + Compose Multiplatform**, Android 태블릿 / iPad |
| 화면 방향 | 가로 고정 |
| 이탈 정책 | **C안** — 화상 유지 + 이탈 가시화 + 복귀 압박 |
| 화면 꺼짐 | 카메라 중단, 오디오 유지 |
| 앱 차단 | Android 화면 고정(선택), iPad 없음. 차단보다 **감지·통보**에 투자 |
| 카메라 중재 | Camera Arbiter 단일 소유. 기본 **BACK_SHARED**(후면 전환, 선생님 공유) |
| 사진 저장 | 앱 전용 저장소만 → **추가 권한 0개** |
| 온보딩 | **「수업 준비실」 리허설** (미션 4개, 프라이밍 필수) |
| 권한 거부 복구 | 선생님 유선 안내. 수업은 오디오 폴백으로 진행 |
| 레이아웃 | **적응형 D** (기본 70/30 분할 ↔ 플로팅 카드) |
| 로컬 프리뷰 | 미표시 |
| 입장 | 시작 5분 전 대기실 |
| 종료 | 선생님 종료 버튼만. 하드 타임아웃 30분 |
| 시간 표시 | 아이에게 미표시. 선생님에게만 + 누적 끊김 시간 |
| 시간 보상 | 선생님 재량 (시스템 미개입) |
| 녹화 | 하지 않음 |
