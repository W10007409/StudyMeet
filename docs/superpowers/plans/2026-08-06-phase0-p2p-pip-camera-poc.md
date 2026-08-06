# Phase 0 (P2P) — PIP 중 카메라 유지 + P2P 연결 PoC 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** raw libwebrtc 기반 P2P 스택에서 (1) 홈 버튼 이후 PIP 상태에서도 카메라 캡처가 계속되는지, (2) 두 단말이 시그널링을 거쳐 실제로 직결되는지를 실기기에서 증명한다.

**Architecture:** 기존 `:spike-android` 모듈의 화상 엔진을 LiveKit에서 raw libwebrtc로 교체한다. PIP 진입, 포그라운드 서비스, 화면 꺼짐 처리, 프레임 카운터는 엔진과 무관하므로 그대로 재사용한다. 카메라 생존 측정은 **PeerConnection도 시그널링도 없이** 로컬 비디오 트랙만으로 가능하므로 서버 없이 먼저 답을 낸다. 그 다음 최소 시그널링 서버를 세워 두 단말을 붙이고, 마지막으로 iPad에서 커스텀 `AVSampleBufferDisplayLayer` 렌더러와 화상통화 PiP를 검증한다.

**Tech Stack:** Kotlin / AGP 9.2.1 / `io.github.webrtc-sdk:android:144.7559.09` (네임스페이스 `org.webrtc.*`) · Swift / UIKit / `WebRTC-SDK` iOS · Node.js WebSocket 시그널링 · coturn

---

## 이 계획이 대체하는 것

`2026-08-06-phase0-livekit-superseded.md` 는 LiveKit SFU 전제로 작성되었고, 설계 §2.3의 P2P 결정으로 폐기되었다. 그 계획의 Task 2~6은 이미 구현되어 브랜치 `feature/phase0-pip-camera-poc` 에 있다. **버리지 않고 엔진만 교체해 재사용한다** — PIP·FGS·화면꺼짐·프레임카운터는 화상 엔진과 무관하기 때문이다.

폐기된 계획의 iOS 파트(Task 7~11)는 LiveKit Swift SDK가 `AVSampleBufferDisplayLayer` 를 공개 제공한다는 전제였다. raw libwebrtc에는 그것이 없으므로 iOS 렌더러는 직접 구현한다. 해당 태스크는 새로 쓴다.

---

## Global Constraints

- Android `minSdk = 26`, `targetSdk = 36`, `compileSdk = release(36) { minorApiLevel = 1 }` — 기존 `app` 모듈과 동일.
- Android Gradle Plugin `9.2.1`. **Kotlin Gradle 플러그인을 따로 적용하지 않는다.** AGP 9의 내장 Kotlin 지원을 쓴다.
- Android WebRTC: `io.github.webrtc-sdk:android:144.7559.09`. 클래스 네임스페이스는 **`org.webrtc.*`** 다. LiveKit이 쓰던 `livekit.org.webrtc.*` 가 아니다.
- iOS deployment target `16.0`. `AVCaptureSession.isMultitaskingCameraAccessSupported` 가 iPadOS 16.0부터다.
- 화면 방향 **가로 고정** (`landscape`).
- 비디오 **480×270 / 24fps** — 설계 §3.1의 기본 화질(270p).
- 시그널링 서버 주소·TURN 자격증명은 **`local.properties`에만** 둔다. 이 파일은 `.gitignore` 에 있다. **자격증명을 절대 커밋하지 않는다.**
- 스파이크 코드는 Phase 1에서 폐기된다. 재사용을 전제로 설계하지 않는다. 목적은 **측정값 확보** 하나다.

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Part A (Task 1–3) | 현재 Windows 머신에서 코드 작성·컴파일 가능. **측정에는 Android 태블릿 실기기 필요** (Android 14/15/16, 삼성 1대 포함) |
| Part B (Task 4–6) | Node.js. 두 대 이상의 Android 기기 (또는 기기 1 + PC 브라우저) |
| Part C (Task 7–10) | **macOS + Xcode 15 이상 + iPad 실기기.** 현재 Windows 머신에서는 실행 불가 |
| Part D (Task 11) | 임의 OS |

---

## File Structure

| 경로 | 책임 | 상태 |
|---|---|---|
| `gradle/libs.versions.toml` | webrtc-sdk 의존성 추가, LiveKit 제거 | 수정 |
| `settings.gradle.kts` | JitPack 저장소 제거 (LiveKit 전용이었음) | 수정 |
| `spike-android/build.gradle.kts` | 의존성·BuildConfig 필드 교체 | 수정 |
| `spike-android/.../WebRtcEngine.kt` | `PeerConnectionFactory`, 카메라 캡처러, 로컬/원격 트랙 관리 | 신규 |
| `spike-android/.../SpikeActivity.kt` | LiveKit 호출부를 `WebRtcEngine` 로 교체 | 수정 |
| `spike-android/.../FrameCounter.kt` | import 를 `org.webrtc.*` 로 변경 | 수정 |
| `spike-android/.../ClassForegroundService.kt` | 변경 없음 | 유지 |
| `spike-android/.../SignalingClient.kt` | WebSocket 시그널링 클라이언트 | 신규 |
| `spike-android/src/androidTest/.../PipCameraSurvivalTest.kt` | 트랙 준비 방식만 변경 | 수정 |
| `signaling/server.js` | 최소 WebSocket 시그널링 서버 | 신규 |
| `signaling/package.json` | 의존성 | 신규 |
| `spikes/ios-p2p-spike/` | 독립 Xcode 프로젝트 | 신규 |
| `docs/superpowers/specs/phase0-poc-results.md` | 측정 결과 기록 | 수정 |

---

## Part A — Android 카메라 생존 측정 (서버 불필요)

여기가 Phase 0의 핵심 질문에 답하는 부분이다. **PeerConnection도 시그널링도 필요 없다.** libwebrtc는 로컬 비디오 트랙만 단독으로 만들 수 있고, PIP가 위협하는 것은 캡처 라이프사이클이지 네트워크가 아니다.

### Task 1: 엔진 교체 — LiveKit 제거, libwebrtc 로컬 카메라 트랙

**Files:**
- Modify: `gradle/libs.versions.toml`
- Modify: `settings.gradle.kts`
- Modify: `spike-android/build.gradle.kts`
- Create: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/WebRtcEngine.kt`
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/FrameCounter.kt`
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `WebRtcEngine(context, eglBase)` — `fun startLocalCamera(sink: VideoSink, preview: SurfaceViewRenderer): Boolean`, `fun setCameraEnabled(enabled: Boolean)`, `fun release()`
  - `FrameCounter : org.webrtc.VideoSink` — `val count: AtomicInteger`, `fun snapshot(): Int`, `fun reset()`
  - `SpikeActivity.localFrames: FrameCounter`, `SpikeActivity.enterPipNow(): Boolean` (기존 유지)

- [ ] **Step 1: 의존성 교체**

Modify `gradle/libs.versions.toml` — `[versions]` 에서 `livekit = "2.27.0"` 줄을 삭제하고 다음을 추가:

```toml
webrtc = "144.7559.09"
```

`[libraries]` 에서 `livekit-android = ...` 줄을 삭제하고 다음을 추가:

```toml
webrtc-android = { group = "io.github.webrtc-sdk", name = "android", version.ref = "webrtc" }
```

`coroutines`, `testRules`, `uiautomator` 항목은 그대로 둔다.

- [ ] **Step 2: JitPack 저장소 제거**

Modify `settings.gradle.kts` — `dependencyResolutionManagement.repositories` 에서 다음 블록을 삭제한다. LiveKit의 전이 의존성(`com.github.davidliu:audioswitch`)을 위한 것이었고, 이제 필요 없다.

```kotlin
        maven {
            url = uri("https://jitpack.io")
            content { includeModule("com.github.davidliu", "audioswitch") }
        }
```

- [ ] **Step 3: 모듈 의존성과 BuildConfig 교체**

Modify `spike-android/build.gradle.kts`:

`dependencies` 블록의 `implementation(libs.livekit.android)` 를 다음으로 교체:

```kotlin
    implementation(libs.webrtc.android)
```

`defaultConfig` 의 두 `buildConfigField` 를 다음으로 교체한다. LiveKit URL·토큰은 더 이상 쓰지 않고, 시그널링 서버 주소를 쓴다 (Part B에서 사용, 지금은 비어 있어도 무방):

```kotlin
        buildConfigField(
            "String",
            "SIGNALING_URL",
            "\"${localProps.getProperty("signaling.url") ?: ""}\""
        )
```

- [ ] **Step 4: 프레임 카운터의 네임스페이스 변경**

Modify `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/FrameCounter.kt` — import 두 줄을 교체한다.

교체 전:
```kotlin
import livekit.org.webrtc.VideoFrame
import livekit.org.webrtc.VideoSink
```
교체 후:
```kotlin
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
```

나머지(`count`, `onFrame`, `snapshot()`, `reset()`)는 그대로 둔다.

- [ ] **Step 5: WebRTC 엔진 작성**

Create `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/WebRtcEngine.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import android.content.Context
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.PeerConnectionFactory
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoSink
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * 로컬 카메라 트랙만 다루는 최소 엔진.
 * PIP가 위협하는 것은 캡처 라이프사이클이므로, 이 측정에는 PeerConnection이 필요 없다.
 */
class WebRtcEngine(
    private val context: Context,
    val eglBase: EglBase,
) {
    companion object {
        // 설계 §3.1의 기본 화질. 얼굴 확인이 목적이라 270p로 충분하다.
        const val WIDTH = 480
        const val HEIGHT = 270
        const val FPS = 24
    }

    private var factory: PeerConnectionFactory? = null
    private var capturer: CameraVideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var surfaceHelper: SurfaceTextureHelper? = null
    private var localTrack: VideoTrack? = null

    /** 전면 카메라를 열고 트랙을 만들어 sink와 preview에 붙인다. 성공하면 true. */
    fun startLocalCamera(sink: VideoSink, preview: SurfaceViewRenderer): Boolean {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .createInitializationOptions()
        )

        val pcFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
        factory = pcFactory

        val enumerator = Camera2Enumerator(context)
        val frontName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
            ?: enumerator.deviceNames.firstOrNull()
            ?: return false

        val cam = enumerator.createCapturer(frontName, null) ?: return false
        capturer = cam

        val helper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        surfaceHelper = helper

        val source = pcFactory.createVideoSource(cam.isScreencast)
        videoSource = source
        cam.initialize(helper, context, source.capturerObserver)
        cam.startCapture(WIDTH, HEIGHT, FPS)

        val track = pcFactory.createVideoTrack("local_video", source)
        track.addSink(sink)
        track.addSink(preview)
        localTrack = track
        return true
    }

    /**
     * 카메라 캡처를 멈추거나 재개한다.
     * 트랙을 파괴하지 않으므로 sink 재부착이 필요 없다.
     */
    fun setCameraEnabled(enabled: Boolean) {
        val cam = capturer ?: return
        if (enabled) {
            cam.startCapture(WIDTH, HEIGHT, FPS)
        } else {
            // stopCapture는 InterruptedException을 던진다. 이 분기는 화면 꺼짐 브로드캐스트에서
            // 코루틴을 타고 들어오므로, 잡지 않으면 측정 중에 Activity가 죽는다.
            try {
                cam.stopCapture()
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    fun release() {
        try {
            capturer?.stopCapture()
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        capturer?.dispose()
        localTrack?.dispose()
        videoSource?.dispose()
        surfaceHelper?.dispose()
        factory?.dispose()
        capturer = null
        localTrack = null
        videoSource = null
        surfaceHelper = null
        factory = null
    }
}
```

- [ ] **Step 6: Activity의 LiveKit 호출부 교체**

Modify `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`.

`io.livekit.*` 와 `livekit.org.webrtc.*` 로 시작하는 import를 **모두 삭제**하고 다음을 추가:

```kotlin
import org.webrtc.EglBase
import org.webrtc.SurfaceViewRenderer
```

`room`, `cameraMutex`, `desiredCameraEnabled`, `isConnected` 를 다음으로 교체:

```kotlin
    private lateinit var engine: WebRtcEngine
    private val eglBase: EglBase = EglBase.create()

    /** 카메라 토글을 직렬화한다. 순서가 뒤집히면 화면이 꺼진 채 카메라가 켜질 수 있다. */
    private val cameraMutex = Mutex()

    @Volatile
    private var desiredCameraEnabled = true

    /** PIP는 카메라가 살아난 뒤에만 의미가 있다. 권한 다이얼로그가 뜰 때도 onUserLeaveHint가 불린다. */
    private var isStarted = false
```

`onCreate()` 에서 `LiveKit.create(...)` 와 `room.initVideoRenderer(...)` 호출을 다음으로 교체:

```kotlin
        engine = WebRtcEngine(applicationContext, eglBase)
        remoteRenderer.init(eglBase.eglBaseContext, null)
        localRenderer.init(eglBase.eglBaseContext, null)
```

`connect()` 전체를 다음으로 교체한다. 서버 접속이 사라졌으므로 이름도 바꾼다:

```kotlin
    private fun startCamera() {
        localFrames.reset()
        remoteFrames.reset()

        ClassForegroundService.start(this)

        val ok = engine.startLocalCamera(sink = localFrames, preview = localRenderer)
        if (!ok) {
            ClassForegroundService.stop(this)
            statusText.text = "카메라 시작 실패"
            return
        }
        isStarted = true
        statusText.text = "카메라 동작 중"
    }
```

`permissionLauncher` 의 성공 분기에서 `connect()` 를 `startCamera()` 로 바꾼다.

`observeEvents()` 함수와 그 호출을 **삭제**한다. 원격 트랙이 없으므로 구독할 이벤트가 없다.

`setCameraEnabled(enabled: Boolean)` 의 본문을 다음으로 교체:

```kotlin
    private fun setCameraEnabled(enabled: Boolean) {
        desiredCameraEnabled = enabled
        lifecycleScope.launch {
            cameraMutex.withLock {
                engine.setCameraEnabled(desiredCameraEnabled)
            }
        }
    }
```

`onUserLeaveHint()` 의 조건을 `isConnected` 에서 `isStarted` 로 바꾼다.

`onDestroy()` 를 다음으로 교체:

```kotlin
    override fun onDestroy() {
        unregisterReceiver(screenReceiver)
        engine.release()
        // 렌더러는 eglBase보다 먼저 해제한다. 각자 EGL 컨텍스트를 쥔 스레드를 돌리고 있어서,
        // 순서가 뒤집히면 스레드가 새고 네이티브 EGL 오류가 난다.
        localRenderer.release()
        remoteRenderer.release()
        eglBase.release()
        ClassForegroundService.stop(this)
        super.onDestroy()
    }
```

레이아웃 XML의 `io.livekit.android.renderer.SurfaceViewRenderer` 두 곳을 `org.webrtc.SurfaceViewRenderer` 로 바꾼다.

- [ ] **Step 7: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug --console=plain
```
Expected: `BUILD SUCCESSFUL`

컴파일 오류가 나면 `io.github.webrtc-sdk:android:144.7559.09` 의 실제 API와 다른 것이다. 클래스 목록은 다음으로 확인한다:
```bash
find ~/.gradle/caches/modules-2/files-2.1/io.github.webrtc-sdk -name '*.aar' | head -1
```
AAR 안의 `classes.jar` 를 `unzip -l` 로 열어 실제 시그니처를 확인하고 맞춘다. **버전은 바꾸지 않는다.**

- [ ] **Step 8: 커밋**

```bash
git add gradle/libs.versions.toml settings.gradle.kts spike-android
git commit -m "spike(android): replace LiveKit with raw libwebrtc local camera track"
```

---

### Task 2: 계측 테스트를 새 엔진에 맞춘다

**Files:**
- Modify: `spike-android/src/androidTest/java/com/wjthinkbig/studymeet/spike/PipCameraSurvivalTest.kt`

**Interfaces:**
- Consumes: `SpikeActivity.localFrames`, `SpikeActivity.enterPipNow()` (Task 1)
- Produces: 없음 (계측 결과만 생산)

- [ ] **Step 1: 서버 의존 가드를 제거한다**

Modify `PipCameraSurvivalTest.kt`.

다음 블록을 **삭제**한다. 서버 접속이 사라져 자격증명이 필요 없으므로, 이 테스트는 이제 **어떤 기기에서든 조건 없이 실행된다.**

```kotlin
        assumeTrue(
            "local.properties에 livekit.url / livekit.token.android 설정 필요",
            BuildConfig.LIVEKIT_URL.isNotBlank() && BuildConfig.LIVEKIT_TOKEN.isNotBlank(),
        )
```

`import org.junit.Assume.assumeTrue` 도 삭제한다.

첫 대기의 타임아웃을 30초에서 15초로 줄인다. 네트워크 접속이 없어져 카메라 시작이 훨씬 빠르다.

```kotlin
            val started = awaitUntil(timeoutMs = 15_000) {
                SpikeActivity.localFrames.snapshot() > 10
            }
            assertTrue("15초 안에 카메라 프레임이 시작되지 않음", started)
```

나머지(PIP 진입, 3초 delta 측정, `Log.i("PipSpike", ...)`, 임계값 30)는 그대로 둔다.

- [ ] **Step 2: 계측 테스트 컴파일**

Run:
```bash
./gradlew :spike-android:assembleDebugAndroidTest --console=plain
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 실기기에서 측정 — Phase 0 Android 파트의 결론**

태블릿을 USB로 연결하고:
```bash
adb devices
adb shell getprop ro.build.version.release
adb logcat -c
./gradlew :spike-android:connectedDebugAndroidTest
adb logcat -d -s PipSpike
```

> `connectedDebugAndroidTest` 는 `DeviceProviderInstrumentTestTask` 라서 `--tests` 옵션을 받지 않는다 (`--serial`, `--rerun` 만 지원). 이 모듈에는 테스트가 하나뿐이라 필터가 필요 없다.

Expected: `adb logcat` 출력에 다음 형태가 찍힌다.
```
PipSpike: PIP frames: before=<n> after=<m> delta=<d>
```

**판정**: `delta >= 30` 이면 PIP 중 카메라가 살아 있다. `delta == 0` 이면 멈춘 것이다. 테스트가 `"PIP 모드 진입 실패"` 로 떨어지면 카메라가 아니라 PIP 자체가 안 된 것이므로, 기기 설정에서 이 앱의 PIP 허용을 확인한다.

- [ ] **Step 4: 기기 매트릭스 채우기**

Android **14, 15, 16** 태블릿 각각에서 Step 3을 반복한다. 삼성 Galaxy Tab을 최소 1대 포함한다 (OEM 차이 확인용).

각 기기마다 전원 버튼으로 화면을 껐다 켜며 다음도 확인한다:
```bash
adb shell dumpsys media.camera | grep -i "com.wjthinkbig.studymeet.spike"
```
Expected: 화면이 꺼진 동안 이 패키지가 카메라 클라이언트 목록에서 사라지고, 켜면 다시 나타난다.

**PIP 상태에서도 같은 확인을 반복한다.** 홈 버튼으로 PIP 진입 → 전원 버튼으로 화면 끄기 → 위 명령으로 확인. 설계 §4.2가 `SCREEN_OFF` 를 정의한 이유가 백그라운드 상황이고, OEM 차이가 가장 크게 갈리는 지점이다.

결과를 `docs/superpowers/specs/phase0-poc-results.md` 의 "B. Android" 표에 기기당 한 행씩 기록한다.

- [ ] **Step 5: 커밋**

```bash
git add spike-android docs/superpowers/specs/phase0-poc-results.md
git commit -m "test(android): measure camera frame continuity in PIP on raw libwebrtc"
```

---

### Task 3: 포그라운드 서비스가 실제로 필요한지 대조 측정

설계 §5.1은 "FGS가 있어야 백그라운드 카메라가 유지된다"는 전제 위에 서 있다. 그런데 PIP는 visible 상태라 FGS 없이도 유지될 수 있다. 그 전제는 아직 아무도 검증하지 않았다.

**Files:**
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`
- Modify: `spike-android/build.gradle.kts`

**Interfaces:**
- Consumes: `ClassForegroundService` (기존)
- Produces: `BuildConfig.USE_FOREGROUND_SERVICE`

- [ ] **Step 1: FGS를 빌드 플래그로 끌 수 있게 한다**

Modify `spike-android/build.gradle.kts` — `defaultConfig` 에 추가:

```kotlin
        buildConfigField(
            "boolean",
            "USE_FOREGROUND_SERVICE",
            (localProps.getProperty("spike.useForegroundService") ?: "true")
        )
```

Modify `SpikeActivity.kt` — `ClassForegroundService.start(this)` 호출을 감싼다:

```kotlin
        if (BuildConfig.USE_FOREGROUND_SERVICE) {
            ClassForegroundService.start(this)
        }
```

`stop(this)` 호출 두 곳도 같은 조건으로 감싼다.

- [ ] **Step 2: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug --console=plain
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: FGS 없이 같은 측정을 돌린다**

`local.properties` 에 다음 줄을 추가하고:
```properties
spike.useForegroundService=false
```

Task 2 Step 3의 절차를 그대로 반복한다.

**판정 — 이것이 설계 §5.1의 운명을 정한다:**
- `delta >= 30` (FGS 없이도 유지됨) → **FGS는 PIP 유지에 불필요하다.** 설계 §5.1을 단순화할 수 있다. 다만 화면 꺼짐 후에도 오디오를 유지하려면 여전히 필요할 수 있으므로, 오디오 전용 FGS로 축소 가능한지 별도 검토한다.
- `delta == 0` (FGS 없으면 멈춤) → **FGS가 load-bearing이다.** 설계 §5.1 유지. Android 14+ 의 `FOREGROUND_SERVICE_CAMERA` 권한 요구도 그대로 유효하다.

측정 후 `local.properties` 의 그 줄을 지워 기본값(`true`)으로 되돌린다.

- [ ] **Step 4: 결과 기록과 커밋**

`phase0-poc-results.md` 의 "FGS 제거 빌드 대조 측정" 체크박스를 채운다.

```bash
git add spike-android docs/superpowers/specs/phase0-poc-results.md
git commit -m "test(android): establish whether the foreground service is load-bearing"
```

---

## Part B — 시그널링과 P2P 연결

### Task 4: 최소 시그널링 서버

**Files:**
- Create: `signaling/package.json`
- Create: `signaling/server.js`
- Create: `signaling/README.md`

**Interfaces:**
- Consumes: 없음
- Produces: `ws://<host>:8080/?room=<roomId>&role=<caller|callee>` 엔드포인트. 같은 `room` 의 두 클라이언트 사이에서 JSON 메시지를 그대로 중계한다.

- [ ] **Step 1: 패키지 정의**

Create `signaling/package.json`:

```json
{
  "name": "studymeet-signaling-spike",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

- [ ] **Step 2: 서버 작성**

Create `signaling/server.js`:

```javascript
// Phase 0 스파이크용 최소 시그널링 서버.
// 같은 room의 두 참가자 사이에서 JSON 메시지를 그대로 중계한다.
// 인증도, 영속성도, 다중 인스턴스 지원도 없다. Phase 1에서 폐기된다.

const { WebSocketServer } = require('ws');
const { parse } = require('url');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // roomId -> Set<WebSocket>

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url, true);
  const roomId = query.room;

  if (!roomId) {
    ws.close(1008, 'room query parameter required');
    return;
  }

  let peers = rooms.get(roomId);
  if (!peers) {
    peers = new Set();
    rooms.set(roomId, peers);
  }

  if (peers.size >= 2) {
    ws.close(1008, 'room full');
    return;
  }

  peers.add(ws);
  console.log(`[join] room=${roomId} peers=${peers.size}`);

  // 두 번째 참가자가 들어오면 양쪽에 알려 협상을 시작시킨다.
  if (peers.size === 2) {
    for (const peer of peers) {
      peer.send(JSON.stringify({ type: 'ready' }));
    }
  }

  ws.on('message', (data) => {
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === peer.OPEN) {
        peer.send(data.toString());
      }
    }
  });

  ws.on('close', () => {
    peers.delete(ws);
    console.log(`[leave] room=${roomId} peers=${peers.size}`);
    for (const peer of peers) {
      if (peer.readyState === peer.OPEN) {
        peer.send(JSON.stringify({ type: 'peer-left' }));
      }
    }
    if (peers.size === 0) rooms.delete(roomId);
  });
});

console.log(`signaling server listening on ws://0.0.0.0:${PORT}`);
```

- [ ] **Step 3: 사용법 문서**

Create `signaling/README.md`:

```markdown
# 시그널링 스파이크 서버

Phase 0 전용. 인증 없음, 영속성 없음, 인스턴스 1대 전제.

## 실행

    cd signaling
    npm install
    npm start

`ws://<PC의 LAN IP>:8080/?room=phase0` 으로 접속한다.
태블릿에서 붙으려면 PC와 같은 네트워크에 있어야 하고, PC 방화벽에서 8080 포트를 열어야 한다.

LAN IP 확인:
- Windows: `ipconfig` 의 IPv4 주소
- macOS: `ipconfig getifaddr en0`

## 프로토콜

같은 `room` 의 두 참가자 사이에서 받은 텍스트를 그대로 상대에게 전달한다.
서버가 스스로 만들어 보내는 메시지는 두 가지뿐이다.

| 메시지 | 시점 |
|---|---|
| `{"type":"ready"}` | 두 번째 참가자가 입장해 협상을 시작해도 될 때 |
| `{"type":"peer-left"}` | 상대가 나갔을 때 |

클라이언트가 주고받는 메시지는 서버가 해석하지 않는다:
`{"type":"offer","sdp":...}`, `{"type":"answer","sdp":...}`,
`{"type":"candidate","candidate":...,"sdpMid":...,"sdpMLineIndex":...}`
```

- [ ] **Step 4: 실행 확인**

Run:
```bash
cd signaling && npm install && npm start
```
Expected: `signaling server listening on ws://0.0.0.0:8080`

다른 터미널에서 두 개의 클라이언트가 붙는지 확인한다:
```bash
npx wscat -c "ws://localhost:8080/?room=test"
```
두 번째 창을 띄우면 **양쪽 모두** `{"type":"ready"}` 를 받아야 한다. 한쪽 창에 아무 텍스트나 입력하면 다른 창에 그대로 나타나야 한다.

- [ ] **Step 5: 커밋**

```bash
git add signaling
git commit -m "spike(signaling): add a minimal two-peer relay server"
```

---

### Task 5: Android 시그널링 클라이언트와 PeerConnection

**Files:**
- Create: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SignalingClient.kt`
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/WebRtcEngine.kt`
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`
- Modify: `spike-android/build.gradle.kts`
- Modify: `gradle/libs.versions.toml`

**Interfaces:**
- Consumes: `WebRtcEngine` (Task 1), 시그널링 프로토콜 (Task 4)
- Produces:
  - `SignalingClient(url, onReady, onMessage, onPeerLeft)` — `fun connect()`, `fun send(json: String)`, `fun close()`
  - `WebRtcEngine.connectPeer(isCaller: Boolean, signaling: SignalingClient, remoteSinks: List<VideoSink>)` — 계측용 `FrameCounter` 와 화면용 `SurfaceViewRenderer` 를 함께 받는다
  - `WebRtcEngine.handleSignal(json: JSONObject, signaling: SignalingClient)`

- [ ] **Step 1: OkHttp 의존성 추가**

Modify `gradle/libs.versions.toml` — `[versions]` 에 추가:

```toml
okhttp = "4.12.0"
```

`[libraries]` 에 추가:

```toml
okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version.ref = "okhttp" }
```

Modify `spike-android/build.gradle.kts` — `dependencies` 에 추가:

```kotlin
    implementation(libs.okhttp)
```

- [ ] **Step 2: 시그널링 클라이언트 작성**

Create `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SignalingClient.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Task 4의 중계 서버에 붙는 최소 클라이언트.
 * 서버가 만들어 보내는 메시지는 ready와 peer-left 둘뿐이고, 나머지는 상대가 보낸 것이다.
 */
class SignalingClient(
    private val url: String,
    private val onReady: () -> Unit,
    private val onMessage: (JSONObject) -> Unit,
    private val onPeerLeft: () -> Unit,
) {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    fun connect() {
        socket = client.newWebSocket(
            Request.Builder().url(url).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "ready" -> onReady()
                        "peer-left" -> onPeerLeft()
                        else -> onMessage(json)
                    }
                }
            },
        )
    }

    fun send(json: String) {
        socket?.send(json)
    }

    fun close() {
        socket?.close(1000, null)
        socket = null
    }
}
```

- [ ] **Step 3: 엔진에 PeerConnection 추가**

Modify `WebRtcEngine.kt`. 다음 import를 추가한다:

```kotlin
import org.json.JSONObject
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
```

클래스에 다음을 추가한다. `startLocalCamera` 가 먼저 호출되어 있어야 한다:

```kotlin
    private var peerConnection: PeerConnection? = null

    /**
     * 상대와 연결한다. isCaller 쪽이 offer를 만든다.
     * 시그널링 서버의 ready 이후에 호출한다.
     */
    fun connectPeer(
        isCaller: Boolean,
        signaling: SignalingClient,
        remoteSinks: List<VideoSink>,
    ) {
        val pcFactory = factory ?: return
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302")
                .createIceServer()
        )

        val pc = pcFactory.createPeerConnection(
            PeerConnection.RTCConfiguration(iceServers).apply {
                sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            },
            object : PeerConnection.Observer {
                override fun onIceCandidate(candidate: IceCandidate) {
                    signaling.send(
                        JSONObject()
                            .put("type", "candidate")
                            .put("candidate", candidate.sdp)
                            .put("sdpMid", candidate.sdpMid)
                            .put("sdpMLineIndex", candidate.sdpMLineIndex)
                            .toString()
                    )
                }

                override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {
                    val track = transceiver.receiver.track() as? VideoTrack ?: return
                    // 프레임 카운터와 화면 렌더러 둘 다 붙인다.
                    remoteSinks.forEach { track.addSink(it) }
                }

                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    // 설계 §4.3의 이탈 교차 확인 경로. 스파이크에서는 로그만 남긴다.
                    android.util.Log.i("PipSpike", "iceConnectionState=$state")
                }

                override fun onSignalingChange(state: PeerConnection.SignalingState) {}
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
                override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
                override fun onAddStream(stream: org.webrtc.MediaStream) {}
                override fun onRemoveStream(stream: org.webrtc.MediaStream) {}
                override fun onDataChannel(channel: org.webrtc.DataChannel) {}
                override fun onRenegotiationNeeded() {}
            },
        ) ?: return

        peerConnection = pc
        localTrack?.let { pc.addTrack(it, listOf("stream")) }

        if (isCaller) {
            pc.createOffer(
                object : SimpleSdpObserver() {
                    override fun onCreateSuccess(sdp: SessionDescription) {
                        pc.setLocalDescription(SimpleSdpObserver(), sdp)
                        signaling.send(
                            JSONObject()
                                .put("type", "offer")
                                .put("sdp", sdp.description)
                                .toString()
                        )
                    }
                },
                MediaConstraints(),
            )
        }
    }

    /** 시그널링으로 받은 메시지를 처리한다. */
    fun handleSignal(json: JSONObject, signaling: SignalingClient) {
        val pc = peerConnection ?: return
        when (json.getString("type")) {
            "offer" -> {
                pc.setRemoteDescription(
                    SimpleSdpObserver(),
                    SessionDescription(SessionDescription.Type.OFFER, json.getString("sdp")),
                )
                pc.createAnswer(
                    object : SimpleSdpObserver() {
                        override fun onCreateSuccess(sdp: SessionDescription) {
                            pc.setLocalDescription(SimpleSdpObserver(), sdp)
                            signaling.send(
                                JSONObject()
                                    .put("type", "answer")
                                    .put("sdp", sdp.description)
                                    .toString()
                            )
                        }
                    },
                    MediaConstraints(),
                )
            }
            "answer" -> pc.setRemoteDescription(
                SimpleSdpObserver(),
                SessionDescription(SessionDescription.Type.ANSWER, json.getString("sdp")),
            )
            "candidate" -> pc.addIceCandidate(
                IceCandidate(
                    json.getString("sdpMid"),
                    json.getInt("sdpMLineIndex"),
                    json.getString("candidate"),
                )
            )
        }
    }
```

같은 파일 끝에 다음을 추가한다:

```kotlin
/** SdpObserver의 네 메서드를 매번 쓰지 않기 위한 기본 구현. */
open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {
        android.util.Log.w("PipSpike", "createSdp failed: $error")
    }
    override fun onSetFailure(error: String?) {
        android.util.Log.w("PipSpike", "setSdp failed: $error")
    }
}
```

`release()` 의 맨 앞에 `peerConnection?.dispose()` 와 `peerConnection = null` 을 추가한다.

- [ ] **Step 4: Activity에서 연결을 시작한다**

Modify `SpikeActivity.kt` — `startCamera()` 의 마지막(`statusText.text = "카메라 동작 중"` 다음)에 추가한다. 역할은 `local.properties` 의 URL에 붙은 쿼리로 정한다:

```kotlin
        if (BuildConfig.SIGNALING_URL.isBlank()) {
            statusText.text = "카메라 동작 중 (시그널링 없음)"
            return
        }

        val isCaller = BuildConfig.SIGNALING_URL.contains("role=caller")
        val signaling = SignalingClient(
            url = BuildConfig.SIGNALING_URL,
            onReady = {
                runOnUiThread { statusText.text = "상대 입장. 협상 시작" }
                engine.connectPeer(
                    isCaller = isCaller,
                    signaling = signalingRef!!,
                    remoteSinks = listOf(remoteFrames, remoteRenderer),
                )
            },
            onMessage = { json -> engine.handleSignal(json, signalingRef!!) },
            onPeerLeft = { runOnUiThread { statusText.text = "상대 나감" } },
        )
        signalingRef = signaling
        signaling.connect()
```

클래스에 다음을 추가한다:

```kotlin
    private var signalingRef: SignalingClient? = null
```

`remoteSinks` 에 `remoteFrames`(계측)와 `remoteRenderer`(화면 표시)를 함께 넘기므로, 원격 트랙 부착은 `onTrack` 한 곳에서 끝난다. 별도 배선이 필요 없다.

`onDestroy()` 에 `signalingRef?.close()` 를 추가한다.

- [ ] **Step 5: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug --console=plain
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: 두 기기로 P2P 연결 확인**

PC에서 시그널링 서버를 띄우고(Task 4), 태블릿 두 대에 각각 다른 `local.properties` 로 빌드해 설치한다.

기기 A:
```properties
signaling.url=ws://<PC의 LAN IP>:8080/?room=phase0&role=caller
```
기기 B:
```properties
signaling.url=ws://<PC의 LAN IP>:8080/?room=phase0&role=callee
```

Expected:
- 서버 콘솔에 `[join] room=phase0 peers=1` → `peers=2`
- 양쪽 화면 상태 텍스트가 `상대 입장. 협상 시작` 으로 바뀜
- **양쪽에 상대 영상이 표시됨**
- `adb logcat -s PipSpike` 에 `iceConnectionState=CONNECTED` 가 찍힘

`iceConnectionState=FAILED` 가 나오면 STUN만으로 직결에 실패한 것이다. Task 6에서 TURN을 붙인다.

- [ ] **Step 7: 커밋**

```bash
git add gradle/libs.versions.toml spike-android
git commit -m "spike(android): connect two devices peer to peer over the signalling server"
```

---

### Task 6: TURN 도입과 릴레이 비율 관찰

설계 §11.1의 리스크 6이다. **P2P의 경제성 전체가 이 숫자에 달려 있다.**

**Files:**
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/WebRtcEngine.kt`
- Modify: `spike-android/build.gradle.kts`
- Create: `signaling/coturn.md`

**Interfaces:**
- Consumes: `WebRtcEngine.connectPeer` (Task 5)
- Produces: `BuildConfig.TURN_URL`, `BuildConfig.TURN_USER`, `BuildConfig.TURN_PASS`

- [ ] **Step 1: coturn 설치 안내 문서**

Create `signaling/coturn.md`:

```markdown
# coturn (TURN 서버) 스파이크 설정

## Docker로 띄우기

    docker run -d --network=host \
      -e TURN_USER=spike -e TURN_PASS=<임의의 값> \
      coturn/coturn \
      -n --lt-cred-mech --fingerprint \
      --user=spike:<임의의 값> \
      --realm=studymeet.local \
      --listening-port=3478 \
      --no-tls --no-dtls

운영에서는 TLS 443이 필수다 (설계 §3.1). 스파이크에서는 평문 3478로 충분하다.

## 자격증명은 커밋하지 않는다

`local.properties` 에만 둔다.

    turn.url=turn:<서버 IP>:3478
    turn.user=spike
    turn.pass=<임의의 값>

## 릴레이 여부 판별

`adb logcat -s PipSpike` 의 `selectedCandidatePair` 로그에서 candidate type을 본다.

| type | 의미 |
|---|---|
| `host` | 같은 LAN 직결 |
| `srflx` | NAT 통과 직결 (STUN) |
| `relay` | **TURN 중계** — 서버 대역폭을 먹는 세션 |

`relay` 비율이 곧 설계 §3.1의 릴레이 비율이다.
```

- [ ] **Step 2: TURN 자격증명을 BuildConfig로 주입**

Modify `spike-android/build.gradle.kts` — `defaultConfig` 에 추가:

```kotlin
        buildConfigField(
            "String", "TURN_URL", "\"${localProps.getProperty("turn.url") ?: ""}\""
        )
        buildConfigField(
            "String", "TURN_USER", "\"${localProps.getProperty("turn.user") ?: ""}\""
        )
        buildConfigField(
            "String", "TURN_PASS", "\"${localProps.getProperty("turn.pass") ?: ""}\""
        )
```

- [ ] **Step 3: ICE 서버 목록에 TURN 추가**

Modify `WebRtcEngine.connectPeer` — `iceServers` 정의를 다음으로 교체:

```kotlin
        val iceServers = buildList {
            add(
                PeerConnection.IceServer.builder("stun:stun.l.google.com:19302")
                    .createIceServer()
            )
            if (BuildConfig.TURN_URL.isNotBlank()) {
                add(
                    PeerConnection.IceServer.builder(BuildConfig.TURN_URL)
                        .setUsername(BuildConfig.TURN_USER)
                        .setPassword(BuildConfig.TURN_PASS)
                        .createIceServer()
                )
            }
        }
```

- [ ] **Step 4: 선택된 후보 쌍을 로그로 남긴다**

`PeerConnection.Observer` 의 `onIceConnectionChange` 를 다음으로 교체한다. 연결이 성립하면 어떤 경로가 선택되었는지 통계에서 읽는다:

```kotlin
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    android.util.Log.i("PipSpike", "iceConnectionState=$state")
                    if (state == PeerConnection.IceConnectionState.CONNECTED) {
                        peerConnection?.getStats { report ->
                            report.statsMap.values
                                .filter { it.type == "candidate-pair" && it.members["state"] == "succeeded" }
                                .forEach { pair ->
                                    val localId = pair.members["localCandidateId"] as? String
                                    val local = report.statsMap[localId]
                                    android.util.Log.i(
                                        "PipSpike",
                                        "selectedCandidatePair localType=${local?.members?.get("candidateType")}",
                                    )
                                }
                        }
                    }
                }
```

> `RTCStatsReport` 의 필드 이름은 libwebrtc 버전에 따라 다를 수 있다. 빌드해서 확인하고, 다르면 실제 이름으로 맞춘 뒤 보고한다.

- [ ] **Step 5: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug --console=plain
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: 네트워크 조합별로 릴레이 여부 측정**

아래 조합을 각각 시도하고 `adb logcat -s PipSpike` 의 `localType` 을 기록한다.

| # | 기기 A | 기기 B | 예상 |
|---|---|---|---|
| 1 | 같은 WiFi | 같은 WiFi | `host` |
| 2 | 집 WiFi | LTE/5G | `srflx` 또는 `relay` |
| 3 | LTE/5G | LTE/5G | **`relay` 가능성 높음** (통신사 CGNAT) |
| 4 | 회사·학교 WiFi | 집 WiFi | `relay` 가능성 높음 |

**3번과 4번이 이 태스크의 핵심이다.** 아이 태블릿의 실제 사용 환경에 가장 가깝고, 설계 §2.3의 SFU 재검토 판단 근거가 된다.

결과를 `phase0-poc-results.md` 의 새 절 "D. 릴레이 비율" 에 기록한다.

- [ ] **Step 7: 커밋**

```bash
git add spike-android signaling docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(android): add TURN and record which ICE candidate type wins"
```

---

## Part C — iPad

> **이 파트는 macOS + Xcode 15 이상 + iPad 실기기가 필요하다.** 환경이 확보되기 전까지 착수하지 않는다.

### Task 7: Xcode 프로젝트와 libwebrtc 로컬 카메라

**Files:**
- Create: `spikes/ios-p2p-spike/` (Xcode 프로젝트)
- Create: `spikes/ios-p2p-spike/P2PSpike/Config.swift`
- Create: `spikes/ios-p2p-spike/P2PSpike/FrameCounter.swift`
- Create: `spikes/ios-p2p-spike/P2PSpike/WebRtcEngine.swift`
- Create: `spikes/ios-p2p-spike/P2PSpike/ClassViewController.swift`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 시그널링 서버 (Task 4)
- Produces: `WebRtcEngine.startLocalCamera(renderers: [RTCVideoRenderer]) -> Bool`, `WebRtcEngine.captureSession: AVCaptureSession?`, `FrameCounter.count`, `Config.signalingURL`

- [ ] **Step 1: Xcode 프로젝트 생성**

File → New → Project → iOS → App.

| 항목 | 값 |
|---|---|
| Product Name | `P2PSpike` |
| Interface | Storyboard |
| Language | Swift |
| Organization Identifier | `com.wjthinkbig.studymeet` |
| 저장 위치 | `<repo>/spikes/ios-p2p-spike/` |

생성 후:
- **Minimum Deployments → iOS `16.0`**
- **Deployment Info → iPad 체크, iPhone 해제**
- **Device Orientation → Landscape Left, Landscape Right만**
- **Requires full screen 은 체크하지 않는다.** iPad 멀티태스킹 카메라 접근은 앱이 멀티태스킹 가능해야 동작한다.

- [ ] **Step 2: WebRTC 프레임워크 추가**

File → Add Package Dependencies…
- URL: `https://github.com/stasel/WebRTC.git`
- Dependency Rule: **Exact Version → `150.0.0`**
- Add to Target: `P2PSpike`

이 패키지는 `WebRTC-M150.xcframework` 를 바이너리 타깃으로 제공한다. Android가 M144(`144.7559.09`)이므로 마일스톤이 6 차이 나지만, WebRTC는 버전 간 상호운용을 전제로 설계되어 있어 offer/answer 협상에 문제가 없다. iOS 쪽에 M144 SPM 배포본이 없어 맞출 수 없다.

협상이 실패하면 **버전 불일치를 원인으로 단정하지 말고** SDP 로그를 먼저 확인한다. 대부분은 코덱이나 `sdpSemantics` 문제다.

- [ ] **Step 3: Info.plist**

```xml
<key>NSCameraUsageDescription</key>
<string>선생님과 화상 수업을 하기 위해 카메라를 사용합니다.</string>
<key>NSMicrophoneUsageDescription</key>
<string>선생님과 대화하기 위해 마이크를 사용합니다.</string>
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>voip</string>
</array>
```

- [ ] **Step 4: 설정 파일과 gitignore**

Create `spikes/ios-p2p-spike/P2PSpike/Config.swift`:

```swift
import Foundation

enum Config {
    /// Task 4의 시그널링 서버. PC의 LAN IP를 쓴다.
    static let signalingURL = "ws://<PC의 LAN IP>:8080/?room=phase0&role=callee"
}
```

Modify `.gitignore` — 끝에 추가:

```
spikes/ios-p2p-spike/P2PSpike/Config.swift
```

Run:
```bash
git check-ignore -v spikes/ios-p2p-spike/P2PSpike/Config.swift
```
Expected: `.gitignore:<줄번호>:spikes/ios-p2p-spike/P2PSpike/Config.swift	...`

- [ ] **Step 5: 프레임 카운터**

Create `spikes/ios-p2p-spike/P2PSpike/FrameCounter.swift`:

```swift
import Foundation
import WebRTC

/// 비디오 트랙에 붙여 프레임 도착 횟수만 센다.
/// 카메라가 실제로 캡처를 계속하는지 판별하는 유일한 근거다.
final class FrameCounter: NSObject, RTCVideoRenderer {

    private let lock = NSLock()
    private var _count = 0

    var count: Int {
        lock.lock(); defer { lock.unlock() }
        return _count
    }

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard frame != nil else { return }
        lock.lock(); _count += 1; lock.unlock()
    }

    func reset() {
        lock.lock(); _count = 0; lock.unlock()
    }
}
```

- [ ] **Step 6: 엔진 — 로컬 카메라만**

Create `spikes/ios-p2p-spike/P2PSpike/WebRtcEngine.swift`:

```swift
import AVFoundation
import WebRTC

/// 로컬 카메라 트랙만 다루는 최소 엔진. Android의 WebRtcEngine과 같은 역할이다.
final class WebRtcEngine {

    // 설계 §3.1의 기본 화질.
    static let width = 480
    static let height = 270
    static let fps = 24

    private let factory: RTCPeerConnectionFactory
    private var capturer: RTCCameraVideoCapturer?
    private var localTrack: RTCVideoTrack?

    /// iPad 멀티태스킹 카메라 접근에 필요하다. RTCCameraVideoCapturer가 공개한다.
    var captureSession: AVCaptureSession? { capturer?.captureSession }

    init() {
        RTCInitializeSSL()
        factory = RTCPeerConnectionFactory(
            encoderFactory: RTCDefaultVideoEncoderFactory(),
            decoderFactory: RTCDefaultVideoDecoderFactory()
        )
    }

    /// 전면 카메라를 열고 트랙을 만들어 renderer들에 붙인다.
    func startLocalCamera(renderers: [RTCVideoRenderer]) -> Bool {
        let source = factory.videoSource()
        let cam = RTCCameraVideoCapturer(delegate: source)
        capturer = cam

        guard let device = RTCCameraVideoCapturer.captureDevices()
            .first(where: { $0.position == .front }) else { return false }

        let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
        guard let format = formats.min(by: { lhs, rhs in
            let l = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
            let r = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
            return abs(Int(l.width) - Self.width) < abs(Int(r.width) - Self.width)
        }) else { return false }

        let track = factory.videoTrack(with: source, trackId: "local_video")
        renderers.forEach { track.add($0) }
        localTrack = track

        cam.startCapture(with: device, format: format, fps: Self.fps)
        return true
    }

    func setCameraEnabled(_ enabled: Bool) {
        if enabled {
            guard let device = RTCCameraVideoCapturer.captureDevices()
                .first(where: { $0.position == .front }),
                  let format = RTCCameraVideoCapturer.supportedFormats(for: device).first
            else { return }
            capturer?.startCapture(with: device, format: format, fps: Self.fps)
        } else {
            capturer?.stopCapture()
        }
    }
}
```

- [ ] **Step 7: 뷰 컨트롤러와 실기기 확인**

Create `ClassViewController.swift` 로 `RTCMTLVideoView` 하나와 상태 레이블을 배치하고, `viewDidLoad` 에서 카메라·마이크 권한을 요청한 뒤 `engine.startLocalCamera(renderers: [previewView, frameCounter])` 를 호출한다. `SceneDelegate` 의 `rootViewController` 를 이것으로 바꾼다.

⌘R 로 iPad에서 실행한다.

Expected: 권한 승인 후 자기 영상이 표시된다.

- [ ] **Step 8: 커밋**

```bash
git add spikes/ios-p2p-spike .gitignore
git commit -m "spike(ios): render the local camera with raw libwebrtc on iPad"
```

---

### Task 8: 멀티태스킹 카메라 접근

**Files:**
- Modify: `spikes/ios-p2p-spike/P2PSpike/ClassViewController.swift`

**Interfaces:**
- Consumes: `WebRtcEngine.captureSession` (Task 7)
- Produces: 없음 (측정값만)

- [ ] **Step 1: 지원 여부 확인과 활성화**

Modify `ClassViewController.swift` — `startLocalCamera` 호출 **직후**에 넣는다:

```swift
        if let session = engine.captureSession {
            let supported = session.isMultitaskingCameraAccessSupported
            if supported {
                session.beginConfiguration()
                session.isMultitaskingCameraAccessEnabled = true
                session.commitConfiguration()
            }
            print("[PoC] multitaskingSupported=\(supported) " +
                  "enabled=\(session.isMultitaskingCameraAccessEnabled)")
        } else {
            print("[PoC] captureSession 접근 불가")
        }
```

`RTCCameraVideoCapturer.captureSession` 은 공개 프로퍼티이므로 `captureSession 접근 불가` 는 나오지 않아야 한다. 나온다면 `startLocalCamera` 가 실패해 `capturer` 가 nil인 것이다.

- [ ] **Step 2: 실기기에서 로그 확인**

⌘R 로 실행하고 Xcode 콘솔을 본다.

Expected: `[PoC] multitaskingSupported=true enabled=true` (지원 iPad) 또는 `false false` (미지원 iPad).

- [ ] **Step 3: 엔터틀먼트 필요 여부 확인**

Xcode → 타겟 → Signing & Capabilities → `+ Capability` 에 **Multitasking Camera Access** 항목이 있는지 확인한다. Step 2에서 이미 `enabled=true` 가 나왔다면 엔터틀먼트 없이 동작한다는 뜻이다.

결과를 `phase0-poc-results.md` 에 기록한다. 이 항목은 배포 일정에 직접 영향을 준다.

- [ ] **Step 4: 커밋**

```bash
git add spikes/ios-p2p-spike docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(ios): detect and enable multitasking camera access"
```

---

### Task 9: PiP용 SampleBuffer 렌더러 직접 구현

설계 §5.2.1이다. LiveKit이 공개 API로 주던 것을 여기서는 직접 만든다.

**Files:**
- Create: `spikes/ios-p2p-spike/P2PSpike/SampleBufferVideoRenderer.swift`
- Create: `spikes/ios-p2p-spike/P2PSpike/PipController.swift`
- Modify: `spikes/ios-p2p-spike/P2PSpike/ClassViewController.swift`

**Interfaces:**
- Consumes: `RTCVideoRenderer` 프로토콜
- Produces: `SampleBufferVideoRenderer: UIView, RTCVideoRenderer` — `var displayLayer: AVSampleBufferDisplayLayer`, `PipController(sourceView:contentViewController:)` — `var isActive: Bool`

- [ ] **Step 1: `RTCVideoFrame` 에서 `CVPixelBuffer` 를 얻는 경로 확인**

Xcode 네비게이터에서 WebRTC 패키지의 `RTCVideoFrame.h` 와 `RTCCVPixelBuffer.h` 를 열어 확인한다:

1. `RTCVideoFrame.buffer` 의 타입 (`RTCVideoFrameBuffer` 프로토콜)
2. `RTCCVPixelBuffer` 로 캐스팅해 `.pixelBuffer` 를 얻는 경로
3. I420 버퍼로 오는 경우의 변환 메서드

확인 결과를 다음 Step의 코드에 반영하고 보고한다.

- [ ] **Step 2: 렌더러 작성**

Create `spikes/ios-p2p-spike/P2PSpike/SampleBufferVideoRenderer.swift`:

```swift
import AVFoundation
import CoreMedia
import UIKit
import WebRTC

/// 원격 비디오 프레임을 AVSampleBufferDisplayLayer에 밀어 넣는다.
/// AVPictureInPictureController는 이 레이어를 통해서만 영상을 표시할 수 있고,
/// raw libwebrtc에는 이에 해당하는 렌더러가 없어 직접 만든다.
final class SampleBufferVideoRenderer: UIView, RTCVideoRenderer {

    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    var displayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }

    func setSize(_ size: CGSize) {}

    func renderFrame(_ frame: RTCVideoFrame?) {
        guard let frame,
              let pixelBuffer = (frame.buffer as? RTCCVPixelBuffer)?.pixelBuffer,
              let sampleBuffer = makeSampleBuffer(from: pixelBuffer)
        else { return }
        displayLayer.enqueue(sampleBuffer)
    }

    private func makeSampleBuffer(from pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
        var formatDescription: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescriptionOut: &formatDescription
        ) == noErr, let formatDescription else { return nil }

        var timing = CMSampleTimingInfo(
            duration: .invalid,
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid
        )

        var sampleBuffer: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: formatDescription,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        ) == noErr else { return nil }

        return sampleBuffer
    }
}
```

`frame.buffer` 가 `RTCCVPixelBuffer` 가 아닌 I420 계열로 오면 `renderFrame` 이 조용히 아무것도 하지 않는다. **Step 1의 확인 결과에 따라 변환 경로를 추가하고, 프레임이 실제로 enqueue되는지 로그로 확인한다.**

- [ ] **Step 3: PiP 컨트롤러 작성**

Create `spikes/ios-p2p-spike/P2PSpike/PipController.swift`:

```swift
import AVKit
import UIKit

/// 화상통화용 PiP. 홈으로 나갈 때 자동으로 시작되도록 구성한다.
final class PipController: NSObject {

    private var controller: AVPictureInPictureController?

    var isActive: Bool { controller?.isPictureInPictureActive ?? false }

    init(sourceView: UIView, contentViewController: AVPictureInPictureVideoCallViewController) {
        super.init()

        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            print("[PoC] PiP 미지원 기기")
            return
        }

        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: sourceView,
            contentViewController: contentViewController
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        controller.delegate = self
        self.controller = controller
    }
}

extension PipController: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerDidStartPictureInPicture(
        _ controller: AVPictureInPictureController
    ) {
        print("[PoC] PiP 시작됨")
    }

    func pictureInPictureController(
        _ controller: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        print("[PoC] PiP 시작 실패: \(error)")
    }

    func pictureInPictureControllerDidStopPictureInPicture(
        _ controller: AVPictureInPictureController
    ) {
        print("[PoC] PiP 종료됨")
    }
}
```

- [ ] **Step 4: 배선**

Modify `ClassViewController.swift`:

```swift
    private let remoteRenderer = SampleBufferVideoRenderer()
    private let pipContentVC = AVPictureInPictureVideoCallViewController()
    private var pipController: PipController?
```

`viewDidLoad` 에서 `remoteRenderer` 를 `pipContentVC.view` 에 넣고, `pipContentVC` 를 자식 뷰 컨트롤러로 붙인 뒤 `PipController(sourceView: view, contentViewController: pipContentVC)` 를 만든다. **`remoteRenderer` 를 `view` 와 `pipContentVC.view` 양쪽에 addSubview 하지 않는다.** 하나의 뷰는 한 곳에만 붙는다.

- [ ] **Step 5: 빌드**

Xcode ⌘B.
Expected: 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add spikes/ios-p2p-spike
git commit -m "spike(ios): hand-write the sample buffer renderer needed for video-call PiP"
```

---

### Task 10: iOS ↔ Android P2P 연결과 PiP 중 카메라 계측

Part C의 결론을 만드는 지점이다.

**Files:**
- Create: `spikes/ios-p2p-spike/P2PSpike/SignalingClient.swift`
- Modify: `spikes/ios-p2p-spike/P2PSpike/WebRtcEngine.swift`
- Modify: `spikes/ios-p2p-spike/P2PSpike/ClassViewController.swift`
- Modify: `docs/superpowers/specs/phase0-poc-results.md`

**Interfaces:**
- Consumes: 시그널링 프로토콜 (Task 4), `SampleBufferVideoRenderer` (Task 9), `FrameCounter` (Task 7)
- Produces: 없음 (측정값만)

- [ ] **Step 1: 시그널링 클라이언트와 PeerConnection**

`URLSessionWebSocketTask` 로 Task 4의 서버에 붙는 `SignalingClient.swift` 를 만들고, `WebRtcEngine` 에 `connectPeer(isCaller:signaling:remoteRenderers:)` 와 `handleSignal(_:signaling:)` 을 추가한다. 메시지 형식은 Android(Task 5)와 **동일해야 한다**:

| 메시지 | 필드 |
|---|---|
| offer / answer | `type`, `sdp` |
| candidate | `type`, `candidate`, `sdpMid`, `sdpMLineIndex` |

ICE 서버도 Android와 같게 구성한다 (STUN + 선택적 TURN).

원격 트랙은 `remoteRenderers` 로 `SampleBufferVideoRenderer` 와 `FrameCounter` 를 **둘 다** 받는다.

- [ ] **Step 2: 1초마다 프레임 카운트를 로그로 남긴다**

XCTest로 PiP 진입을 안정적으로 자동화하기 어렵다. 주기 로그 + 수동 홈 제스처로 측정한다.

Modify `ClassViewController.swift` — `viewDidLoad` 마지막에 추가:

```swift
        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let now = self.localFrames.count
            let delta = now - self.lastLocalCount
            self.lastLocalCount = now
            let pip = self.pipController?.isActive == true
            print("[PoC] pip=\(pip) localFramesPerSec=\(delta) total=\(now)")
        }
```

`deinit` 에서 `meterTimer?.invalidate()` 한다.

- [ ] **Step 3: 두 단말로 측정**

PC에서 시그널링 서버를 띄우고, Android 태블릿을 `role=caller` 로, iPad를 `role=callee` 로 붙인다.

1. 양쪽에 상대 영상이 표시되는지 확인
2. iPad에서 **홈 제스처** → Xcode 콘솔에 `[PoC] PiP 시작됨` 확인
3. PiP 창에 Android 쪽 영상이 계속 재생되는지 확인
4. 10초 대기하며 `localFramesPerSec` 관찰
5. 앱으로 복귀

**판정**: PiP 진입 후 3초 동안 `localFramesPerSec` 합이 **30 이상**이면 카메라가 유지된 것이다 (Android와 동일 기준). `pip=true` 이후 값이 `0` 이면 유지되지 않은 것이다.

PiP 창이 검게만 나오면 카메라가 아니라 **Task 9의 렌더러 문제**다. `renderFrame` 에서 `enqueue` 가 실제로 호출되는지 로그로 먼저 확인한다.

- [ ] **Step 4: iPad 매트릭스**

**최신 세대 1대 이상, 구형 세대 1대 이상**을 포함해 최소 3대에서 Step 3을 반복하고 `phase0-poc-results.md` 의 "C. iPad" 표를 채운다.

구형 iPad에서 `isMultitaskingCameraAccessSupported=false` 가 나오는 것은 정상이며, 그 경우 `PiP 중 프레임/3초` 가 `0` 이 되는 것이 설계 §5.2의 "미지원 기기는 오디오만 폴백" 근거가 된다.

- [ ] **Step 5: 커밋**

```bash
git add spikes/ios-p2p-spike docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(ios): measure camera continuity during PiP across iPad models"
```

---

## Part D — 결론

### Task 11: 결과 판정과 설계 반영

**Files:**
- Modify: `docs/superpowers/specs/phase0-poc-results.md`
- Modify: `docs/superpowers/specs/2026-08-06-studymeet-video-tutoring-design.md`

**Interfaces:**
- Consumes: Task 2·3·6·10의 측정 결과
- Produces: Phase 1 착수 가부 판정

- [ ] **Step 1: 결론 섹션을 채운다**

측정에 근거해서만 채운다. 측정하지 않은 항목을 추정으로 채우지 않는다. 미검증은 미검증으로 남긴다.

- [ ] **Step 2: 설계 문서에 반영**

| 측정 결과 | 설계 반영 |
|---|---|
| Android PIP 중 카메라 유지 확인 | §5.1 유지. Phase 1 착수 |
| 특정 OEM에서만 실패 | §5.1에 해당 기기 예외와 오디오 폴백 명시 |
| 전 기기 실패 | §5.1 재설계. **Phase 1 착수 보류** |
| **FGS 없이도 유지됨** | §5.1에서 카메라 FGS 제거 가능 여부 검토. 오디오 유지용으로 축소 가능한지 별도 판단 |
| **FGS 없으면 멈춤** | §5.1 유지. Android 14+ FGS 권한 요구 그대로 |
| iPad 최신 세대에서 유지 확인 | §5.2 유지. 지원 기기 목록 추가 |
| iPad 전 세대 실패 | §5.2를 "iPad는 오디오만 유지"로 변경 |
| **릴레이 비율 10% 이하** | §2.3에 따라 P2P 유지 확정 |
| **릴레이 비율 30% 초과** | §2.3에 따라 **SFU(LiveKit) 재검토를 후속 과제로 승격**. 절감액 재산정 |
| Task 9 렌더러 구현이 예상보다 큼 | §11.1 리스크 8 실현. SFU 전환 시점을 앞당기는 근거 |

- [ ] **Step 3: 커밋과 보고**

```bash
git add docs/superpowers/specs
git commit -m "docs: record Phase 0 results and reflect them in the design"
```

다음 형식으로 보고한다. 추정 금지, 측정값만 인용한다.

```
Phase 0 (P2P) 결과
- Android PIP 카메라: <기기 수>대, delta = <값 목록>. 판정: 유지됨 / 부분 / 실패
- FGS 대조:          delta = <값>. 판정: FGS 필요 / 불필요
- iPad PiP 카메라:    <기기 수>대, 3초 합 = <값 목록>. 판정: 유지됨 / 부분 / 실패 / 미검증
- 릴레이 비율:        <조합별 candidate type>. 판정: P2P 유지 / SFU 재검토
- 설계 변경: <있음(어느 섹션) / 없음>
- Phase 1 착수: 가능 / 보류(사유)
```

---

## 부록 — 이 계획이 하지 않는 것

| 항목 | 담당 |
|---|---|
| KMP 구조 전환, `expect`/`actual` 정의 | Phase 1 |
| 시그널링 서버의 인증·다중 인스턴스·재연결 | Phase 1 |
| ICE restart, WiFi↔LTE 전환 처리 | Phase 2 (설계 §11.1 리스크 7) |
| Android 화면 고정(`startLockTask`) | Phase 2 |
| 이탈 상태 모델과 DataChannel 통보 | Phase 2 |
| 리허설 온보딩, 대기실 | Phase 3 |
| Camera Arbiter, 사진 촬영·업로드 | Phase 4 |
| 학습 화면 가안, 페이지 동기화, 포인터 | Phase 5 |
| TURN 운영 구성(TLS 443), 대규모 부하 | Phase 6 |
| SFU(LiveKit) 전환 | 후속 과제 (설계 §2.3) |

스파이크 코드(`spike-android/`, `signaling/`, `spikes/ios-p2p-spike/`)는 Phase 1 착수 시점에 삭제한다. 남길 것은 `phase0-poc-results.md` 의 측정값뿐이다.
