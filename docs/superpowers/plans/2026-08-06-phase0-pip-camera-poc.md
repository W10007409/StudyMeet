# Phase 0 — PIP 중 카메라 유지 PoC 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이가 홈 버튼을 눌러 앱이 PIP로 축소된 뒤에도 카메라 캡처와 화상 송수신이 계속되는지를 Android 태블릿과 iPad 실기기에서 증명한다.

**Architecture:** 두 개의 버려질 네이티브 스파이크를 만든다. Android는 기존 Gradle 프로젝트에 `:spike-android` 모듈을 추가하고, iOS는 `spikes/ios-pip-spike/`에 독립 Xcode 프로젝트를 만든다. 양쪽 모두 LiveKit Cloud의 같은 방에 접속해 카메라를 켠 뒤, **로컬 카메라 트랙에 프레임 카운터를 붙여** PIP 진입 전후의 프레임 증가량을 측정한다. 프레임이 계속 늘어나면 카메라가 살아 있는 것이다. KMP 구조는 Phase 1에서 만들며 이 단계에서는 쓰지 않는다.

**Tech Stack:** Kotlin / Android Gradle Plugin 9.2.1 / `io.livekit:livekit-android:2.27.0` · Swift / SwiftUI+UIKit / `livekit/client-sdk-swift` 2.16.0 · LiveKit Cloud (PoC 전용) · `lk` CLI

---

## Global Constraints

- Android `minSdk = 26`, `targetSdk = 36`, `compileSdk = release(36) { minorApiLevel = 1 }` — 기존 `app` 모듈과 동일하게 맞춘다.
- Android Gradle Plugin `9.2.1`. **Kotlin Gradle 플러그인을 따로 적용하지 않는다.** 이 저장소의 `app` 모듈이 Kotlin 플러그인 없이 `.kt` 파일을 쓰고 있으므로 AGP 9의 내장 Kotlin 지원을 그대로 따른다.
- Android LiveKit SDK 버전 `2.27.0`. WebRTC 클래스는 `org.webrtc.*`가 아니라 **`livekit.org.webrtc.*`** 네임스페이스다.
- iOS deployment target `16.0`. `AVCaptureSession.isMultitaskingCameraAccessSupported`가 iPadOS 16.0부터이므로 낮출 수 없다.
- iOS LiveKit SDK 버전 `2.16.0` (Swift Package Manager).
- 화면 방향 **가로 고정** (`landscape`).
- 비디오 해상도 **360p / 24fps** — 스펙 §3.1의 기본 화질과 동일하게 맞춘다.
- LiveKit 접속 정보(`livekit.url`, `livekit.token`)는 **`local.properties`에만** 둔다. 이 파일은 이미 `.gitignore`에 있다. 토큰을 절대 커밋하지 않는다.
- 스파이크 코드는 Phase 1에서 폐기된다. 재사용을 전제로 설계하지 않는다. 목적은 **측정값 확보** 하나다.

### 실행 환경 요건

| 파트 | 필요 환경 |
|---|---|
| Part A (공통) | 임의 OS + `lk` CLI |
| Part B (Android, Task 2–6) | 현재 Windows 머신에서 실행 가능. **Android 14 / 15 / 16 태블릿 실기기 필요** (삼성 Galaxy Tab 최소 1대 포함) |
| Part C (iOS, Task 7–11) | **macOS + Xcode 15 이상 + iPad 실기기 필요.** 현재 Windows 머신에서는 실행 불가 |
| Part D (Task 12) | 임의 OS |

**Part C를 수행할 macOS 환경과 iPad 실기기가 확보되지 않으면 Part B와 Part D만 진행하고, Part C는 환경 확보 시점까지 미완으로 둔다.** Part C 결과 없이 iOS 설계를 확정해서는 안 된다.

---

## File Structure

**생성**

| 경로 | 책임 |
|---|---|
| `settings.gradle.kts` (수정) | `:spike-android` 모듈 등록 |
| `spike-android/build.gradle.kts` | 스파이크 모듈 빌드 설정, `local.properties` → `BuildConfig` 주입 |
| `spike-android/src/main/AndroidManifest.xml` | 권한, PIP 지원 Activity, camera\|microphone FGS 선언 |
| `spike-android/src/main/java/.../FrameCounter.kt` | `VideoSink` 구현. 프레임 수만 센다 |
| `spike-android/src/main/java/.../ClassForegroundService.kt` | `foregroundServiceType="camera\|microphone"` 서비스. 알림 하나만 띄운다 |
| `spike-android/src/main/java/.../SpikeActivity.kt` | LiveKit 접속, 렌더링, PIP 진입/전환, 화면 꺼짐 처리 |
| `spike-android/src/main/res/layout/activity_spike.xml` | 원격/로컬 렌더러 + 상태 텍스트 |
| `spike-android/src/androidTest/java/.../PipCameraSurvivalTest.kt` | PIP 중 프레임 지속 계측 테스트 |
| `spikes/ios-pip-spike/` | 독립 Xcode 프로젝트 |
| `spikes/ios-pip-spike/Sources/CameraCapability.swift` | 멀티태스킹 카메라 접근 지원 여부 탐지 |
| `spikes/ios-pip-spike/Sources/FrameCounter.swift` | LiveKit `VideoRenderer` 구현. 프레임 수만 센다 |
| `spikes/ios-pip-spike/Sources/SampleBufferRenderer.swift` | 원격 프레임 → `AVSampleBufferDisplayLayer` |
| `spikes/ios-pip-spike/Sources/PipController.swift` | `AVPictureInPictureController` 화상통화 PiP |
| `spikes/ios-pip-spike/Sources/ClassViewController.swift` | LiveKit 접속, 렌더링, PiP 연결 |
| `docs/superpowers/specs/phase0-poc-results.md` | 실기기 검증 결과 기록. Phase 1 착수 판단 근거 |

---

## Part A — 공통 준비

### Task 1: LiveKit Cloud 프로젝트와 접속 토큰 확보

**Files:**
- Create: `local.properties` 항목 추가 (파일은 이미 존재)
- Create: `docs/superpowers/specs/phase0-poc-results.md`

**Interfaces:**
- Consumes: 없음
- Produces: `local.properties`의 `livekit.url` (예: `wss://xxxx.livekit.cloud`), `livekit.token.android`, `livekit.token.ios` — 이후 모든 태스크가 이 값을 읽는다.

- [ ] **Step 1: 기존 프로젝트가 빌드되는지 먼저 확인**

이 저장소는 Kotlin Gradle 플러그인 없이 `.kt` 파일을 쓴다. AGP 9의 내장 Kotlin 지원 가정이 맞는지 여기서 확정한다.

Run:
```bash
./gradlew :app:assembleDebug
```
Expected: `BUILD SUCCESSFUL`

실패하고 오류가 Kotlin 컴파일 관련이면(`Cannot resolve .kt`, `no Kotlin plugin applied` 등) 이 계획의 Global Constraints를 위반한 상태다. **진행을 멈추고 보고한다.** 다른 오류(SDK 미설치 등)면 그 오류만 해결하고 재실행한다.

- [ ] **Step 2: LiveKit Cloud 프로젝트 생성**

1. https://cloud.livekit.io 접속, 계정 생성 후 프로젝트를 만든다.
2. Settings → Keys 에서 **API Key**와 **API Secret**을 확보한다.
3. 프로젝트의 **WebSocket URL** (`wss://<프로젝트>.livekit.cloud`)을 확보한다.

- [ ] **Step 3: `lk` CLI 설치**

Windows:
```bash
winget install LiveKit.LiveKitCLI
```
macOS:
```bash
brew install livekit-cli
```

Run:
```bash
lk --version
```
Expected: 버전 문자열 출력 (예: `lk version 2.x.x`)

- [ ] **Step 4: 참가자 토큰 2개 발급**

`<API_KEY>` `<API_SECRET>`를 Step 2의 값으로 치환한다. 방 이름은 `phase0-spike`로 고정한다.

```bash
lk token create \
  --api-key <API_KEY> --api-secret <API_SECRET> \
  --join --room phase0-spike --identity android-spike \
  --valid-for 720h

lk token create \
  --api-key <API_KEY> --api-secret <API_SECRET> \
  --join --room phase0-spike --identity ios-spike \
  --valid-for 720h
```
Expected: 각각 `eyJ...` 로 시작하는 JWT 문자열 출력

- [ ] **Step 5: `local.properties`에 기록**

`C:\Project\Android\StudyMeet\local.properties` 끝에 다음 3줄을 추가한다. 값은 Step 2·4에서 얻은 것으로 치환한다.

```properties
livekit.url=wss://<프로젝트>.livekit.cloud
livekit.token.android=eyJ...
livekit.token.ios=eyJ...
```

- [ ] **Step 6: `local.properties`가 커밋되지 않는지 확인**

Run:
```bash
git check-ignore -v local.properties
```
Expected: `.gitignore:<줄번호>:local.properties	local.properties` 형태의 출력. **아무것도 출력되지 않으면 `.gitignore`에 `local.properties`를 추가한 뒤 다시 실행한다.**

- [ ] **Step 7: 결과 기록 파일 생성**

Create `docs/superpowers/specs/phase0-poc-results.md`:

```markdown
# Phase 0 PoC 검증 결과

- 검증 시작일:
- LiveKit Cloud 프로젝트: (프로젝트명만. URL·키는 기록하지 않는다)

## B. Android — PIP 중 카메라 유지

| 기기 | OS 버전 | 제조사 | PIP 진입 | PIP 중 프레임/3초 | 화면 꺼짐 시 카메라 중단 | 비고 |
|---|---|---|---|---|---|---|
| | | | | | | |

## C. iPad — 멀티태스킹 카메라 접근 + 화상통화 PiP

| 기기 | iPadOS | isMultitaskingCameraAccessSupported | PiP 진입 | PiP 중 프레임/3초 | 비고 |
|---|---|---|---|---|---|
| | | | | | |

## 결론

- [ ] Android: PIP 중 카메라 유지 확인됨 / 확인 실패
- [ ] iPad: PiP 중 카메라 유지 확인됨 / 확인 실패 / 미검증(환경 미확보)

## 설계 영향

(측정 결과가 설계 문서 §5를 바꾸는지 여기 기록)
```

- [ ] **Step 8: 커밋**

```bash
git add docs/superpowers/specs/phase0-poc-results.md .gitignore
git commit -m "docs: add Phase 0 PoC result template"
```

---

## Part B — Android 스파이크

### Task 2: `:spike-android` 모듈 생성과 LiveKit 접속

**Files:**
- Modify: `settings.gradle.kts`
- Create: `spike-android/build.gradle.kts`
- Create: `spike-android/src/main/AndroidManifest.xml`
- Create: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/FrameCounter.kt`
- Create: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`
- Create: `spike-android/src/main/res/layout/activity_spike.xml`
- Modify: `gradle/libs.versions.toml`

**Interfaces:**
- Consumes: `local.properties`의 `livekit.url`, `livekit.token.android` (Task 1)
- Produces:
  - `FrameCounter` — `livekit.org.webrtc.VideoSink` 구현. `val count: AtomicInteger`
  - `SpikeActivity` — `companion object { val localFrames: FrameCounter }`, `fun enterPipNow(): Boolean`
  - `BuildConfig.LIVEKIT_URL`, `BuildConfig.LIVEKIT_TOKEN`

- [ ] **Step 1: 버전 카탈로그에 LiveKit과 테스트 의존성 추가**

Modify `gradle/libs.versions.toml` — `[versions]` 블록 끝에 추가:

```toml
livekit = "2.27.0"
coroutines = "1.10.2"
testRules = "1.7.0"
uiautomator = "2.3.0"
```

`[libraries]` 블록 끝에 추가:

```toml
livekit-android = { group = "io.livekit", name = "livekit-android", version.ref = "livekit" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
androidx-test-rules = { group = "androidx.test", name = "rules", version.ref = "testRules" }
androidx-test-uiautomator = { group = "androidx.test.uiautomator", name = "uiautomator", version.ref = "uiautomator" }
```

- [ ] **Step 2: 모듈 등록**

Modify `settings.gradle.kts` — 마지막 줄 `include(":app")` 아래에 추가:

```kotlin
include(":spike-android")
```

- [ ] **Step 3: 모듈 빌드 스크립트 작성**

Create `spike-android/build.gradle.kts`:

```kotlin
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.wjthinkbig.studymeet.spike"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.wjthinkbig.studymeet.spike"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField(
            "String",
            "LIVEKIT_URL",
            "\"${localProps.getProperty("livekit.url") ?: ""}\""
        )
        buildConfigField(
            "String",
            "LIVEKIT_TOKEN",
            "\"${localProps.getProperty("livekit.token.android") ?: ""}\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.material)
    implementation(libs.livekit.android)
    implementation(libs.kotlinx.coroutines.android)

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.uiautomator)
}
```

- [ ] **Step 4: Manifest 작성**

Create `spike-android/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CAMERA" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

    <uses-feature android:name="android.hardware.camera.any" android:required="true" />
    <uses-feature android:name="android.software.picture_in_picture" android:required="true" />

    <application
        android:label="StudyMeet Spike"
        android:supportsRtl="true"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <activity
            android:name=".SpikeActivity"
            android:exported="true"
            android:supportsPictureInPicture="true"
            android:resizeableActivity="true"
            android:screenOrientation="landscape"
            android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
```

- [ ] **Step 5: 프레임 카운터 작성**

Create `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/FrameCounter.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import livekit.org.webrtc.VideoFrame
import livekit.org.webrtc.VideoSink
import java.util.concurrent.atomic.AtomicInteger

/**
 * 비디오 트랙에 붙여 프레임 도착 횟수만 센다.
 * 카메라가 실제로 캡처를 계속하는지 판별하는 유일한 근거다.
 */
class FrameCounter(val label: String) : VideoSink {
    val count = AtomicInteger(0)

    override fun onFrame(frame: VideoFrame?) {
        count.incrementAndGet()
    }

    fun snapshot(): Int = count.get()
}
```

- [ ] **Step 6: 레이아웃 작성**

Create `spike-android/src/main/res/layout/activity_spike.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#000000">

    <io.livekit.android.renderer.SurfaceViewRenderer
        android:id="@+id/remoteRenderer"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <io.livekit.android.renderer.SurfaceViewRenderer
        android:id="@+id/localRenderer"
        android:layout_width="200dp"
        android:layout_height="150dp"
        android:layout_gravity="bottom|end"
        android:layout_margin="16dp" />

    <TextView
        android:id="@+id/statusText"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_margin="12dp"
        android:padding="8dp"
        android:background="#88000000"
        android:textColor="#FFFFFF"
        android:textSize="14sp"
        android:text="연결 대기" />

</FrameLayout>
```

- [ ] **Step 7: Activity 작성 (접속과 렌더링까지만)**

Create `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import android.Manifest
import android.os.Bundle
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.launch

class SpikeActivity : AppCompatActivity() {

    companion object {
        /** 로컬 카메라 프레임 카운터. 계측 테스트가 이 값을 읽는다. */
        val localFrames = FrameCounter("local")
        /** 원격 참가자 프레임 카운터. */
        val remoteFrames = FrameCounter("remote")
    }

    private lateinit var room: Room
    private lateinit var remoteRenderer: SurfaceViewRenderer
    private lateinit var localRenderer: SurfaceViewRenderer
    private lateinit var statusText: TextView

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            if (granted.values.all { it }) {
                connect()
            } else {
                statusText.text = "권한 거부됨"
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_spike)

        remoteRenderer = findViewById(R.id.remoteRenderer)
        localRenderer = findViewById(R.id.localRenderer)
        statusText = findViewById(R.id.statusText)

        room = LiveKit.create(
            appContext = applicationContext,
            options = RoomOptions(adaptiveStream = false, dynacast = false),
        )
        room.initVideoRenderer(remoteRenderer)
        room.initVideoRenderer(localRenderer)

        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS,
            )
        )
    }

    private fun connect() {
        if (BuildConfig.LIVEKIT_URL.isBlank() || BuildConfig.LIVEKIT_TOKEN.isBlank()) {
            statusText.text = "local.properties에 livekit.url / livekit.token.android 필요"
            return
        }

        lifecycleScope.launch {
            launch { observeEvents() }

            statusText.text = "접속 중…"
            room.connect(BuildConfig.LIVEKIT_URL, BuildConfig.LIVEKIT_TOKEN)

            room.localParticipant.setMicrophoneEnabled(true)
            room.localParticipant.setCameraEnabled(true)

            val local = room.localParticipant.getTrackPublication(
                io.livekit.android.room.track.Track.Source.CAMERA
            )?.track as? LocalVideoTrack

            local?.let {
                it.addRenderer(localRenderer)
                it.addRenderer(localFrames)
            }
            statusText.text = "접속됨"
        }
    }

    private suspend fun observeEvents() {
        room.events.collect { event ->
            when (event) {
                is RoomEvent.TrackSubscribed -> {
                    (event.track as? VideoTrack)?.let {
                        it.addRenderer(remoteRenderer)
                        it.addRenderer(remoteFrames)
                    }
                }
                is RoomEvent.Disconnected -> statusText.text = "연결 끊김"
                else -> Unit
            }
        }
    }

    override fun onDestroy() {
        room.disconnect()
        super.onDestroy()
    }
}
```

- [ ] **Step 8: 빌드 검증**

Run:
```bash
./gradlew :spike-android:assembleDebug
```
Expected: `BUILD SUCCESSFUL`

컴파일 오류가 나면 LiveKit 2.27.0의 실제 API 시그니처와 다른 것이다. 다음으로 확인한다:
```bash
./gradlew :spike-android:dependencies --configuration debugCompileClasspath | findstr livekit
```
그리고 https://github.com/livekit/client-sdk-android 의 v2.27.0 태그 소스에서 `LocalParticipant`, `Room`, `VideoTrack`의 실제 시그니처를 확인해 코드를 맞춘다. **버전은 바꾸지 않는다.**

- [ ] **Step 9: 실기기에서 접속 확인**

Android 태블릿을 USB로 연결하고:
```bash
./gradlew :spike-android:installDebug
adb shell am start -n com.wjthinkbig.studymeet.spike/.SpikeActivity
```
Expected: 권한 다이얼로그 3개 승인 후 화면 우하단에 **자기 카메라 영상**이 표시되고 상태 텍스트가 `접속됨`으로 바뀐다.

- [ ] **Step 10: 커밋**

```bash
git add settings.gradle.kts gradle/libs.versions.toml spike-android
git commit -m "spike(android): connect to LiveKit and render local camera"
```

---

### Task 3: camera|microphone 포그라운드 서비스

앱이 백그라운드로 내려가도 카메라·마이크 접근을 유지하려면 해당 타입의 FGS가 **앱이 아직 포그라운드일 때 미리** 기동되어 있어야 한다. Android 12+ 는 백그라운드에서의 FGS 시작을 막는다.

**Files:**
- Create: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/ClassForegroundService.kt`
- Modify: `spike-android/src/main/AndroidManifest.xml`
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`

**Interfaces:**
- Consumes: `SpikeActivity` (Task 2)
- Produces: `ClassForegroundService.start(context: Context)`, `ClassForegroundService.stop(context: Context)`

- [ ] **Step 1: 서비스 작성**

Create `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/ClassForegroundService.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 수업 중 카메라·마이크 접근을 백그라운드에서도 유지하기 위한 포그라운드 서비스.
 * 반드시 앱이 포그라운드일 때 start 해야 한다.
 */
class ClassForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "studymeet_class"
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, ClassForegroundService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ClassForegroundService::class.java))
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel()

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("수업 진행 중")
            .setContentText("선생님과 연결되어 있어요")
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        return START_STICKY
    }

    private fun createChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "수업",
                    NotificationManager.IMPORTANCE_LOW,
                )
            )
        }
    }
}
```

- [ ] **Step 2: Manifest에 서비스 등록**

Modify `spike-android/src/main/AndroidManifest.xml` — `</application>` 바로 위에 추가:

```xml
        <service
            android:name=".ClassForegroundService"
            android:exported="false"
            android:foregroundServiceType="camera|microphone" />
```

- [ ] **Step 3: 접속 성공 시점에 서비스 기동**

Modify `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt` — `connect()` 안에서 `room.connect(...)` 호출 **직전**에 다음 줄을 넣는다:

```kotlin
            ClassForegroundService.start(this@SpikeActivity)
```

그리고 `onDestroy()`의 `room.disconnect()` **직후**에 넣는다:

```kotlin
        ClassForegroundService.stop(this)
```

- [ ] **Step 4: 서비스가 올바른 타입으로 떠 있는지 확인**

앱을 재설치·실행한 뒤:
```bash
./gradlew :spike-android:installDebug
adb shell am start -n com.wjthinkbig.studymeet.spike/.SpikeActivity
adb shell dumpsys activity services com.wjthinkbig.studymeet.spike
```
Expected: 출력 안에 `ClassForegroundService` 항목이 있고 `isForeground=true`, 그리고 `foregroundServiceType` 에 `camera` 와 `microphone` 이 모두 표시된다.

`startForeground` 에서 `SecurityException: Starting FGS with type camera ... requires permissions` 가 나면 CAMERA/RECORD_AUDIO 런타임 권한이 아직 승인되지 않은 상태에서 서비스를 시작한 것이다. Step 3의 삽입 위치가 권한 승인 이후(`connect()` 내부)인지 다시 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add spike-android
git commit -m "spike(android): start camera|microphone foreground service before connecting"
```

---

### Task 4: PIP 진입과 PIP 전용 UI

**Files:**
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`

**Interfaces:**
- Consumes: `SpikeActivity` (Task 2, 3)
- Produces: `SpikeActivity.enterPipNow(): Boolean` — 계측 테스트가 호출한다

- [ ] **Step 1: PIP 진입과 모드 전환 처리 추가**

Modify `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`.

import 블록에 추가:

```kotlin
import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.util.Rational
import android.view.View
```

클래스 안에 다음 3개 멤버를 추가한다:

```kotlin
    /** PIP 진입. 성공하면 true. */
    fun enterPipNow(): Boolean {
        val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(16, 9))
            .build()
        return enterPictureInPictureMode(params)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        enterPipNow()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        // PIP에서는 선생님 영상만 남긴다. 나머지는 숨긴다.
        val hidden = if (isInPictureInPictureMode) View.GONE else View.VISIBLE
        localRenderer.visibility = hidden
        statusText.visibility = hidden
    }
```

- [ ] **Step 2: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 실기기에서 홈 버튼 동작 육안 확인**

```bash
./gradlew :spike-android:installDebug
adb shell am start -n com.wjthinkbig.studymeet.spike/.SpikeActivity
```
접속된 뒤 태블릿에서 **홈 버튼(또는 홈 제스처)** 을 누른다.

Expected: 앱이 화면 모서리의 작은 창(PIP)으로 축소되고, 그 안에 영상이 계속 보인다. 상태 텍스트와 로컬 프리뷰는 사라진다.

- [ ] **Step 4: 커밋**

```bash
git add spike-android
git commit -m "spike(android): enter PIP on home and switch to remote-only layout"
```

---

### Task 5: PIP 중 카메라 프레임 지속 계측 테스트

이 태스크가 Phase 0 Android 파트의 **결론을 만드는 지점**이다.

**Files:**
- Create: `spike-android/src/androidTest/java/com/wjthinkbig/studymeet/spike/PipCameraSurvivalTest.kt`

**Interfaces:**
- Consumes: `SpikeActivity.localFrames`, `SpikeActivity.enterPipNow()` (Task 2, 4)
- Produces: 없음 (계측 결과만 생산)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `spike-android/src/androidTest/java/com/wjthinkbig/studymeet/spike/PipCameraSurvivalTest.kt`:

```kotlin
package com.wjthinkbig.studymeet.spike

import android.Manifest
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.GrantPermissionRule
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PipCameraSurvivalTest {

    @get:Rule
    val permissions: GrantPermissionRule = GrantPermissionRule.grant(
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.POST_NOTIFICATIONS,
    )

    /** 3초 동안 최소 이만큼의 프레임이 들어와야 카메라가 살아 있다고 본다. 24fps의 절반 수준. */
    private val minFramesIn3Seconds = 30

    @Test
    fun cameraKeepsProducingFramesWhileInPictureInPicture() {
        assumeTrue(
            "local.properties에 livekit.url / livekit.token.android 설정 필요",
            BuildConfig.LIVEKIT_URL.isNotBlank() && BuildConfig.LIVEKIT_TOKEN.isNotBlank(),
        )

        ActivityScenario.launch(SpikeActivity::class.java).use { scenario ->

            // 1. 접속되어 카메라 프레임이 흐르기 시작할 때까지 기다린다.
            val started = awaitUntil(timeoutMs = 30_000) {
                SpikeActivity.localFrames.snapshot() > 10
            }
            assertTrue("30초 안에 카메라 프레임이 시작되지 않음", started)

            // 2. PIP로 진입한다.
            scenario.onActivity { it.enterPipNow() }

            val inPip = awaitUntil(timeoutMs = 10_000) {
                var value = false
                scenario.onActivity { value = it.isInPictureInPictureMode }
                value
            }
            assertTrue("PIP 모드 진입 실패", inPip)

            // 3. PIP 상태에서 3초 동안 프레임 증가량을 측정한다.
            val before = SpikeActivity.localFrames.snapshot()
            Thread.sleep(3_000)
            val after = SpikeActivity.localFrames.snapshot()
            val delta = after - before

            assertTrue(
                "PIP 중 카메라 프레임이 멈춤. before=$before after=$after delta=$delta " +
                    "(최소 기대치 $minFramesIn3Seconds)",
                delta >= minFramesIn3Seconds,
            )
        }
    }

    private fun awaitUntil(timeoutMs: Long, condition: () -> Boolean): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return true
            Thread.sleep(200)
        }
        return false
    }
}
```

- [ ] **Step 2: 테스트를 실행해 현재 상태를 확인**

태블릿을 연결한 상태에서:
```bash
./gradlew :spike-android:connectedDebugAndroidTest --tests "*PipCameraSurvivalTest*"
```

Expected: 다음 셋 중 하나가 나온다. **어느 쪽이든 PoC의 유효한 결과다.**

- `PASS` → PIP 중 카메라가 유지된다. 설계 §5.1이 검증됨.
- `FAIL: PIP 중 카메라 프레임이 멈춤. before=... after=... delta=0` → 이 기기에서는 유지되지 않는다. Task 6에서 원인을 좁힌다.
- `FAIL: PIP 모드 진입 실패` → PIP 자체가 안 된 것이다. `adb shell dumpsys activity | findstr -i pip` 로 상태를 확인하고, 기기 설정의 "PIP 허용"이 켜져 있는지 본다.

- [ ] **Step 3: 결과를 기록 파일에 적는다**

`docs/superpowers/specs/phase0-poc-results.md` 의 "B. Android" 표에 이번 기기 행을 채운다. `PIP 중 프레임/3초` 열에는 테스트 출력의 `delta` 값을 그대로 적는다. 통과했으면 통과한 값을 적기 위해 다음을 실행한다:

```bash
./gradlew :spike-android:connectedDebugAndroidTest --tests "*PipCameraSurvivalTest*" --info | findstr /i "delta before after"
```

- [ ] **Step 4: 커밋**

```bash
git add spike-android docs/superpowers/specs/phase0-poc-results.md
git commit -m "test(android): measure camera frame continuity in PIP"
```

---

### Task 6: 화면 꺼짐 시 카메라 중단, 그리고 기기 매트릭스 확장

설계 §4.2는 `SCREEN_OFF` 상태에서 카메라를 의도적으로 끄기로 했다. 그 동작을 구현하고, 여러 기기에서 Task 5를 반복한다.

**Files:**
- Modify: `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`
- Modify: `docs/superpowers/specs/phase0-poc-results.md`

**Interfaces:**
- Consumes: `SpikeActivity` (Task 2–4)
- Produces: 없음

- [ ] **Step 1: 화면 꺼짐 감지와 카메라 중단 구현**

Modify `spike-android/src/main/java/com/wjthinkbig/studymeet/spike/SpikeActivity.kt`.

import 블록에 추가:

```kotlin
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent as AndroidIntent
import android.content.IntentFilter
```

클래스 안에 추가:

```kotlin
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: AndroidIntent?) {
            when (intent?.action) {
                AndroidIntent.ACTION_SCREEN_OFF -> setCameraEnabled(false)
                AndroidIntent.ACTION_SCREEN_ON -> setCameraEnabled(true)
            }
        }
    }

    private fun setCameraEnabled(enabled: Boolean) {
        lifecycleScope.launch {
            room.localParticipant.setCameraEnabled(enabled)
        }
    }
```

`onCreate()`의 마지막(권한 요청 호출 뒤)에 추가:

```kotlin
        registerReceiver(
            screenReceiver,
            IntentFilter().apply {
                addAction(AndroidIntent.ACTION_SCREEN_OFF)
                addAction(AndroidIntent.ACTION_SCREEN_ON)
            },
        )
```

`onDestroy()`의 맨 앞에 추가:

```kotlin
        unregisterReceiver(screenReceiver)
```

- [ ] **Step 2: 빌드**

Run:
```bash
./gradlew :spike-android:assembleDebug
```
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 화면 꺼짐 동작을 육안·로그로 확인**

```bash
./gradlew :spike-android:installDebug
adb shell am start -n com.wjthinkbig.studymeet.spike/.SpikeActivity
```
접속 후 태블릿의 **전원 버튼**을 눌러 화면을 끈다. 5초 뒤 다시 켠다.

프레임이 멈췄다 재개되는지는 다음으로 본다:
```bash
adb shell dumpsys media.camera | findstr /i "com.wjthinkbig.studymeet.spike"
```
Expected: 화면이 꺼진 동안에는 이 패키지가 카메라 클라이언트 목록에서 사라지고, 화면을 켜면 다시 나타난다.

- [ ] **Step 4: 기기 매트릭스 채우기**

Android **14, 15, 16** 태블릿 각각에서 Task 5 Step 2의 테스트를 실행한다. 삼성 Galaxy Tab을 최소 1대 포함한다(OEM 차이 확인 목적).

각 기기마다:
```bash
adb devices
adb -s <시리얼> shell getprop ro.build.version.release
./gradlew :spike-android:connectedDebugAndroidTest --tests "*PipCameraSurvivalTest*"
```

결과를 `docs/superpowers/specs/phase0-poc-results.md` 의 "B. Android" 표에 기기당 한 행씩 기록한다. `화면 꺼짐 시 카메라 중단` 열은 Step 3의 관찰 결과(`정상 중단` / `중단 안 됨`)를 적는다.

- [ ] **Step 5: 커밋**

```bash
git add spike-android docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(android): stop camera on screen off, record device matrix"
```

---

## Part C — iPad 스파이크

> **이 파트는 macOS + Xcode 15 이상 + iPad 실기기가 필요하다.** 현재 개발 머신(Windows 11)에서는 실행할 수 없다. 환경이 확보되기 전까지 Part C는 착수하지 않는다.

### Task 7: Xcode 스파이크 프로젝트 생성과 LiveKit 접속

**Files:**
- Create: `spikes/ios-pip-spike/` (Xcode 프로젝트)
- Create: `spikes/ios-pip-spike/PipSpike/Config.swift`
- Create: `spikes/ios-pip-spike/PipSpike/FrameCounter.swift`
- Create: `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`
- Modify: `spikes/ios-pip-spike/PipSpike/Info.plist`

**Interfaces:**
- Consumes: `local.properties`의 `livekit.url`, `livekit.token.ios` (Task 1)
- Produces:
  - `Config.livekitURL: String`, `Config.livekitToken: String`
  - `FrameCounter` — `LiveKit.VideoRenderer` 구현. `var count: Int { get }`
  - `ClassViewController` — `func connect() async`, `var localFrames: FrameCounter`

- [ ] **Step 1: Xcode 프로젝트 생성**

Xcode에서 File → New → Project → iOS → App 을 선택하고 다음 값으로 만든다.

| 항목 | 값 |
|---|---|
| Product Name | `PipSpike` |
| Interface | Storyboard |
| Language | Swift |
| Organization Identifier | `com.wjthinkbig.studymeet` |
| 저장 위치 | `<repo>/spikes/ios-pip-spike/` |

생성 후 프로젝트 설정에서:
- **Minimum Deployments → iOS `16.0`**
- **Deployment Info → iPad 체크, iPhone 해제**
- **Device Orientation → Landscape Left, Landscape Right만 체크**
- **Requires full screen 은 체크하지 않는다.** iPad 멀티태스킹 카메라 접근은 앱이 멀티태스킹 가능해야 동작한다.

- [ ] **Step 2: LiveKit Swift SDK 추가**

File → Add Package Dependencies… 에서:
- URL: `https://github.com/livekit/client-sdk-swift.git`
- Dependency Rule: **Exact Version → `2.16.0`**
- Add to Target: `PipSpike`

- [ ] **Step 3: Info.plist 설정**

`spikes/ios-pip-spike/PipSpike/Info.plist` 에 다음 키를 추가한다(Xcode의 Info 탭에서 편집해도 된다).

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

- [ ] **Step 4: 접속 정보 파일 작성**

`local.properties`는 Gradle 전용이므로 iOS에서는 읽지 않는다. 대신 커밋되지 않는 Swift 파일 하나를 만든다.

Create `spikes/ios-pip-spike/PipSpike/Config.swift`:

```swift
import Foundation

enum Config {
    /// Task 1에서 발급한 LiveKit Cloud WebSocket URL
    static let livekitURL = "wss://<프로젝트>.livekit.cloud"
    /// Task 1에서 발급한 ios-spike 참가자 토큰
    static let livekitToken = "eyJ..."
}
```

`<프로젝트>` 와 `eyJ...` 는 Task 1 Step 4의 실제 값으로 치환한다.

Modify `.gitignore` — 파일 끝에 추가:

```
spikes/ios-pip-spike/PipSpike/Config.swift
```

Run:
```bash
git check-ignore -v spikes/ios-pip-spike/PipSpike/Config.swift
```
Expected: `.gitignore:<줄번호>:spikes/ios-pip-spike/PipSpike/Config.swift	...`

- [ ] **Step 5: LiveKit `VideoRenderer` 프로토콜의 실제 시그니처 확인**

SDK 버전에 따라 메서드 시그니처가 다르다. 코드를 쓰기 전에 실제 정의를 확인한다.

Run:
```bash
find ~/Library/Developer/Xcode/DerivedData -path '*client-sdk-swift*' -name 'VideoRenderer.swift' | head -1 | xargs cat
```
또는 프로젝트 네비게이터에서 Package Dependencies → LiveKit → `Core/VideoRenderer.swift` 를 연다.

Expected: `protocol VideoRenderer` 안의 프로퍼티·메서드 목록. 다음 Step의 코드가 이 정의와 다르면 **정의 쪽에 맞춘다.**

- [ ] **Step 6: 프레임 카운터 작성**

Create `spikes/ios-pip-spike/PipSpike/FrameCounter.swift`:

```swift
import Foundation
import LiveKit

/// 비디오 트랙에 붙여 프레임 도착 횟수만 센다.
/// 카메라가 실제로 캡처를 계속하는지 판별하는 유일한 근거다.
final class FrameCounter: VideoRenderer {

    private let lock = NSLock()
    private var _count = 0

    var count: Int {
        lock.lock(); defer { lock.unlock() }
        return _count
    }

    var isAdaptiveStreamEnabled: Bool { false }
    var adaptiveStreamSize: CGSize { .zero }

    func set(size: CGSize) {}

    func render(frame: VideoFrame) {
        lock.lock(); _count += 1; lock.unlock()
    }
}
```

Step 5에서 확인한 프로토콜에 `render(frame:captureDevice:captureOptions:)` 같은 추가 요구사항이 있으면 그 메서드도 같은 방식으로 카운트를 올리도록 구현한다.

- [ ] **Step 7: 접속 뷰 컨트롤러 작성**

Create `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`:

```swift
import UIKit
import AVFoundation
import LiveKit

final class ClassViewController: UIViewController {

    let room = Room()
    let localFrames = FrameCounter()
    let remoteFrames = FrameCounter()

    private let statusLabel = UILabel()
    private let localVideoView = VideoView()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        localVideoView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(localVideoView)

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textColor = .white
        statusLabel.text = "연결 대기"
        view.addSubview(statusLabel)

        NSLayoutConstraint.activate([
            localVideoView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            localVideoView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            localVideoView.widthAnchor.constraint(equalToConstant: 200),
            localVideoView.heightAnchor.constraint(equalToConstant: 150),

            statusLabel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
        ])

        Task { await connect() }
    }

    func connect() async {
        do {
            try await configureAudioSession()
            try await room.connect(url: Config.livekitURL, token: Config.livekitToken)
            try await room.localParticipant.setMicrophone(enabled: true)
            try await room.localParticipant.setCamera(enabled: true)

            if let publication = room.localParticipant.firstCameraPublication,
               let track = publication.track as? VideoTrack {
                track.add(videoRenderer: localVideoView)
                track.add(videoRenderer: localFrames)
            }

            await MainActor.run { self.statusLabel.text = "접속됨" }
        } catch {
            await MainActor.run { self.statusLabel.text = "접속 실패: \(error)" }
        }
    }

    private func configureAudioSession() async throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .defaultToSpeaker])
        try session.setActive(true)
    }
}
```

- [ ] **Step 8: 앱 진입점을 이 뷰 컨트롤러로 바꾼다**

`SceneDelegate.swift` 의 `scene(_:willConnectTo:options:)` 본문을 다음으로 교체한다:

```swift
        guard let windowScene = (scene as? UIWindowScene) else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ClassViewController()
        self.window = window
        window.makeKeyAndVisible()
```

- [ ] **Step 9: 실기기 빌드와 접속 확인**

iPad를 연결하고 Xcode에서 실행 대상으로 선택한 뒤 ⌘R.

Expected: 카메라·마이크 권한 다이얼로그 승인 후 우하단에 자기 영상이 보이고 좌상단 텍스트가 `접속됨`이 된다.

빌드 오류가 나면 LiveKit 2.16.0의 실제 API와 다른 것이다. Xcode 네비게이터에서 Package Dependencies → LiveKit 의 `Room`, `LocalParticipant`, `VideoTrack` 정의를 열어 시그니처를 맞춘다. **버전은 바꾸지 않는다.**

- [ ] **Step 10: 커밋**

```bash
git add spikes/ios-pip-spike .gitignore
git commit -m "spike(ios): connect to LiveKit and render local camera on iPad"
```

---

### Task 8: 멀티태스킹 카메라 접근 지원 여부 탐지와 활성화

**Files:**
- Create: `spikes/ios-pip-spike/PipSpike/CameraCapability.swift`
- Modify: `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`

**Interfaces:**
- Consumes: `ClassViewController` (Task 7)
- Produces: `CameraCapability.isMultitaskingSupported: Bool`, `CameraCapability.enableMultitaskingAccess(on:) -> Bool`

- [ ] **Step 1: 능력 탐지 유틸 작성**

Create `spikes/ios-pip-spike/PipSpike/CameraCapability.swift`:

```swift
import AVFoundation

/// iPadOS 16+ 의 멀티태스킹 카메라 접근 지원 여부를 판별하고 켠다.
/// 지원하지 않는 기기에서는 백그라운드 진입 시 캡처가 중단된다.
enum CameraCapability {

    static func isMultitaskingSupported(session: AVCaptureSession) -> Bool {
        session.isMultitaskingCameraAccessSupported
    }

    /// 지원하는 기기에서만 켠다. 켜졌으면 true.
    @discardableResult
    static func enableMultitaskingAccess(on session: AVCaptureSession) -> Bool {
        guard session.isMultitaskingCameraAccessSupported else { return false }
        session.beginConfiguration()
        session.isMultitaskingCameraAccessEnabled = true
        session.commitConfiguration()
        return session.isMultitaskingCameraAccessEnabled
    }
}
```

- [ ] **Step 2: LiveKit이 쓰는 `AVCaptureSession`에 접근할 수 있는지 확인**

이 스파이크의 핵심 미지수다. LiveKit Swift SDK는 내부적으로 카메라 캡처를 관리하므로, 그 `AVCaptureSession` 객체를 외부에서 얻을 수 있어야 위 유틸을 적용할 수 있다.

Xcode 네비게이터에서 Package Dependencies → LiveKit → `Track/Local/CameraCapturer.swift` (또는 유사 이름)를 열고 다음을 확인해 기록한다:

1. `AVCaptureSession` 인스턴스가 `public` 또는 `internal` 중 무엇으로 노출되는가
2. `LocalVideoTrack` 또는 `CameraCapturer` 에서 그 세션에 도달하는 공개 경로가 있는가

Expected 결과는 셋 중 하나다. **어느 쪽인지 `phase0-poc-results.md` 의 "C. iPad" 표 비고란에 반드시 적는다.**

- **(가) 공개 접근 가능** → Step 3으로 진행
- **(나) 비공개지만 SDK가 자체 옵션을 제공** (`CameraCaptureOptions` 등에 멀티태스킹 관련 필드) → 그 옵션을 쓰도록 Step 3을 수정
- **(다) 접근 불가** → **LiveKit Swift SDK 포크 또는 커스텀 `VideoCapturer` 구현이 필요하다는 뜻이다. Phase 0의 중대 발견이므로 즉시 기록하고 Task 12에서 설계 영향으로 다룬다.**

- [ ] **Step 3: 접속 직후 멀티태스킹 접근을 켠다**

Modify `spikes/ios-pip-spike/PipSpike/ClassViewController.swift` — `connect()` 안에서 `setCamera(enabled: true)` 호출 **직후**에 넣는다. `<세션 접근 경로>` 는 Step 2 (가)에서 확인한 실제 경로로 치환한다.

```swift
            if let session = <세션 접근 경로> {
                let supported = CameraCapability.isMultitaskingSupported(session: session)
                let enabled = CameraCapability.enableMultitaskingAccess(on: session)
                print("[PoC] multitaskingSupported=\(supported) enabled=\(enabled)")
            } else {
                print("[PoC] AVCaptureSession 접근 불가 — Step 2 (다) 경로")
            }
```

Step 2가 (나)로 판명된 경우에는 위 블록 대신 SDK가 제공하는 옵션을 `setCamera` 호출에 넘기고, 같은 형식의 `print("[PoC] ...")` 로그를 남긴다.

- [ ] **Step 4: 실기기에서 로그 확인**

⌘R로 실행하고 Xcode 콘솔을 본다.

Expected: `[PoC] multitaskingSupported=true enabled=true` (지원 iPad) 또는 `[PoC] multitaskingSupported=false enabled=false` (미지원 iPad).

- [ ] **Step 5: 엔터틀먼트 필요 여부 확인**

Xcode → 타겟 → Signing & Capabilities → `+ Capability` 목록에서 **Multitasking Camera Access** 항목이 존재하는지 확인한다.

- 존재하고 추가가 필요하면 추가한 뒤 재빌드하고, **Apple 별도 신청이 필요한지**를 기록한다.
- Step 4에서 이미 `enabled=true`가 나왔다면 엔터틀먼트 없이 동작한다는 뜻이다.

어느 쪽이든 결과를 `phase0-poc-results.md` 비고란에 적는다. 이 항목은 배포 일정에 직접 영향을 준다.

- [ ] **Step 6: 커밋**

```bash
git add spikes/ios-pip-spike docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(ios): detect and enable multitasking camera access"
```

---

### Task 9: 원격 영상을 AVSampleBufferDisplayLayer로 렌더

iOS 화상통화 PiP는 `AVPictureInPictureController`가 요구하는 레이어에 원격 영상이 올라가 있어야 동작한다. LiveKit의 `VideoView`로는 PiP에 넘길 수 없다.

**Files:**
- Create: `spikes/ios-pip-spike/PipSpike/SampleBufferRenderer.swift`
- Modify: `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`

**Interfaces:**
- Consumes: `FrameCounter`의 `VideoRenderer` 준수 방식 (Task 7 Step 5–6)
- Produces: `SampleBufferRenderer: UIView, VideoRenderer` — `var displayLayer: AVSampleBufferDisplayLayer { get }`

- [ ] **Step 1: `VideoFrame`에서 `CVPixelBuffer`를 꺼내는 경로 확인**

Xcode 네비게이터에서 Package Dependencies → LiveKit → `Types/VideoFrame.swift` 를 열고 다음을 확인한다:

1. `VideoFrame.buffer` 의 타입
2. 그 타입에서 `CVPixelBuffer` 로 가는 프로퍼티 이름 (예: `pixelBuffer`)
3. `CVPixelBuffer` 를 직접 담지 않는 버퍼 타입(I420 등)이 있는지, 있다면 변환 메서드 이름

확인 결과를 다음 Step의 코드에 반영한다.

- [ ] **Step 2: 렌더러 작성**

Create `spikes/ios-pip-spike/PipSpike/SampleBufferRenderer.swift`:

```swift
import UIKit
import AVFoundation
import CoreMedia
import LiveKit

/// 원격 비디오 프레임을 AVSampleBufferDisplayLayer에 밀어 넣는다.
/// AVPictureInPictureController는 이 레이어를 통해서만 영상을 표시할 수 있다.
final class SampleBufferRenderer: UIView, VideoRenderer {

    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    var displayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }

    var isAdaptiveStreamEnabled: Bool { false }
    var adaptiveStreamSize: CGSize { bounds.size }

    func set(size: CGSize) {}

    func render(frame: VideoFrame) {
        // Step 1에서 확인한 경로로 CVPixelBuffer를 얻는다.
        guard let pixelBuffer = pixelBuffer(from: frame) else { return }
        guard let sampleBuffer = makeSampleBuffer(from: pixelBuffer) else { return }
        displayLayer.enqueue(sampleBuffer)
    }

    private func pixelBuffer(from frame: VideoFrame) -> CVPixelBuffer? {
        // Task 9 Step 1의 확인 결과에 맞춘다.
        // 예: (frame.buffer as? CVPixelVideoBuffer)?.pixelBuffer
        return (frame.buffer as? CVPixelVideoBuffer)?.pixelBuffer
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

`CVPixelVideoBuffer` 라는 타입명이 존재하지 않는다는 컴파일 오류가 나면 Step 1에서 확인한 실제 타입명으로 바꾼다. 프레임이 I420 계열이라 `CVPixelBuffer`를 직접 얻을 수 없으면, SDK가 제공하는 변환 메서드를 쓰고 그 사실을 결과 파일에 기록한다.

- [ ] **Step 3: 원격 트랙을 이 렌더러에 연결**

Modify `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`.

클래스 프로퍼티에 추가:

```swift
    let remoteRenderer = SampleBufferRenderer()
```

`viewDidLoad()` 의 `view.backgroundColor = .black` 바로 아래에 추가:

```swift
        remoteRenderer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(remoteRenderer)
        NSLayoutConstraint.activate([
            remoteRenderer.topAnchor.constraint(equalTo: view.topAnchor),
            remoteRenderer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            remoteRenderer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            remoteRenderer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
```

그리고 `ClassViewController` 를 `RoomDelegate` 로 확장해 원격 트랙을 붙인다. 파일 끝에 추가:

```swift
extension ClassViewController: RoomDelegate {
    func room(_ room: Room,
              participant: RemoteParticipant,
              didSubscribeTrack publication: RemoteTrackPublication) {
        guard let track = publication.track as? VideoTrack else { return }
        track.add(videoRenderer: remoteRenderer)
        track.add(videoRenderer: remoteFrames)
    }
}
```

`viewDidLoad()` 의 `Task { await connect() }` 바로 위에 추가:

```swift
        room.add(delegate: self)
```

델리게이트 메서드명이 SDK 2.16.0과 다르면 Package Dependencies → LiveKit → `Core/RoomDelegate.swift` 에서 실제 시그니처를 확인해 맞춘다.

- [ ] **Step 4: 두 참가자로 원격 영상 확인**

Android 스파이크(Task 2)를 같은 방 `phase0-spike`에 접속시킨 상태로 iPad 앱을 실행한다.

Expected: iPad 전체 화면에 Android 쪽 카메라 영상이 표시된다.

- [ ] **Step 5: 커밋**

```bash
git add spikes/ios-pip-spike
git commit -m "spike(ios): render remote video into AVSampleBufferDisplayLayer"
```

---

### Task 10: 화상통화 PiP 연결

**Files:**
- Create: `spikes/ios-pip-spike/PipSpike/PipController.swift`
- Modify: `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`

**Interfaces:**
- Consumes: `SampleBufferRenderer` (Task 9)
- Produces: `PipController(sourceView:contentViewController:)`, `PipController.isActive: Bool`

- [ ] **Step 1: PiP 컨트롤러 작성**

Create `spikes/ios-pip-spike/PipSpike/PipController.swift`:

```swift
import AVKit
import UIKit

/// 화상통화용 PiP. 홈으로 나갈 때 자동으로 PiP가 시작되도록 구성한다.
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

- [ ] **Step 2: PiP 콘텐츠 뷰 컨트롤러 구성과 연결**

Modify `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`.

import 블록에 추가:

```swift
import AVKit
```

클래스 프로퍼티에 추가:

```swift
    private let pipContentVC = AVPictureInPictureVideoCallViewController()
    private var pipController: PipController?
```

`viewDidLoad()` 의 `room.add(delegate: self)` 바로 위에 추가:

```swift
        // PiP 창에는 원격 영상만 넣는다.
        pipContentVC.view.addSubview(remoteRenderer)
        remoteRenderer.frame = pipContentVC.view.bounds
        remoteRenderer.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        pipController = PipController(
            sourceView: view,
            contentViewController: pipContentVC
        )
```

Task 9 Step 3에서 `remoteRenderer`를 `view`에 addSubview 하고 제약을 걸었던 부분은 **삭제한다.** 하나의 뷰는 한 곳에만 붙을 수 있고, PiP 콘텐츠 뷰 컨트롤러가 그 소유자가 되어야 한다. 삭제 대상은 다음 블록이다:

```swift
        remoteRenderer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(remoteRenderer)
        NSLayoutConstraint.activate([
            remoteRenderer.topAnchor.constraint(equalTo: view.topAnchor),
            remoteRenderer.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            remoteRenderer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            remoteRenderer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
```

대신 인라인 상태에서도 원격 영상이 보이도록, `pipContentVC` 를 자식 뷰 컨트롤러로 붙인다. 위 삭제 위치에 다음을 넣는다:

```swift
        addChild(pipContentVC)
        pipContentVC.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(pipContentVC.view)
        NSLayoutConstraint.activate([
            pipContentVC.view.topAnchor.constraint(equalTo: view.topAnchor),
            pipContentVC.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            pipContentVC.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pipContentVC.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        pipContentVC.didMove(toParent: self)
```

- [ ] **Step 3: 빌드**

Xcode ⌘B.
Expected: 빌드 성공. `remoteRenderer` 가 두 곳에 addSubview 되지 않았는지 다시 확인한다.

- [ ] **Step 4: 홈 스와이프로 PiP 진입 확인**

iPad에서 ⌘R 실행 → Android 스파이크가 같은 방에 있는 상태에서 원격 영상이 보이는 것을 확인 → **홈 제스처(화면 하단에서 위로 스와이프)** 를 한다.

Expected: Xcode 콘솔에 `[PoC] PiP 시작됨` 이 찍히고, iPad 화면 모서리에 작은 PiP 창으로 선생님(=Android 쪽) 영상이 계속 재생된다.

`[PoC] PiP 시작 실패:` 가 찍히면 오류 메시지를 그대로 결과 파일에 기록한다.

- [ ] **Step 5: 커밋**

```bash
git add spikes/ios-pip-spike
git commit -m "spike(ios): start video-call PiP automatically on home gesture"
```

---

### Task 11: PiP 중 카메라 유지 계측과 iPad 매트릭스

Part C의 결론을 만드는 지점이다.

**Files:**
- Modify: `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`
- Modify: `docs/superpowers/specs/phase0-poc-results.md`

**Interfaces:**
- Consumes: `localFrames` (Task 7), `pipController` (Task 10)
- Produces: 없음 (계측 결과만 생산)

- [ ] **Step 1: 1초마다 프레임 카운트를 로그로 남긴다**

XCTest로 PiP 진입을 안정적으로 자동화하기 어렵다. 대신 **주기 로그 + 수동 홈 제스처**로 측정한다.

Modify `spikes/ios-pip-spike/PipSpike/ClassViewController.swift`.

클래스 프로퍼티에 추가:

```swift
    private var meterTimer: Timer?
    private var lastLocalCount = 0
```

`viewDidLoad()` 의 마지막에 추가:

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

`deinit` 을 클래스에 추가:

```swift
    deinit {
        meterTimer?.invalidate()
    }
```

- [ ] **Step 2: 빌드하고 실기기에서 측정**

⌘R 실행 → 접속 확인 → Xcode 콘솔을 보면서 **홈 제스처**로 PiP 진입 → 10초 대기 → 앱으로 복귀.

Expected 로그 형태:
```
[PoC] pip=false localFramesPerSec=24 total=120
[PoC] pip=false localFramesPerSec=24 total=144
[PoC] pip=true  localFramesPerSec=24 total=168     <- PiP 진입 후에도 유지되면 성공
[PoC] pip=true  localFramesPerSec=24 total=192
```

**판정 기준**: PiP 진입 후 3초 동안 `localFramesPerSec` 합이 **30 이상**이면 카메라가 유지된 것이다(Android Task 5와 동일 기준). `pip=true` 이후 값이 `0`으로 떨어지면 유지되지 않은 것이다.

- [ ] **Step 3: 결과 기록**

`docs/superpowers/specs/phase0-poc-results.md` 의 "C. iPad" 표를 채운다.

| 열 | 채우는 값 |
|---|---|
| 기기 | 예: iPad Pro 11" (M2) |
| iPadOS | `설정 → 일반 → 정보`의 버전 |
| isMultitaskingCameraAccessSupported | Task 8 Step 4의 로그 값 |
| PiP 진입 | Task 10 Step 4에서 `PiP 시작됨` 여부 |
| PiP 중 프레임/3초 | Step 2의 `pip=true` 구간 3초 합계 |
| 비고 | Task 8 Step 2의 (가)/(나)/(다), Step 5의 엔터틀먼트 결과, Task 9 Step 1의 버퍼 타입 |

- [ ] **Step 4: 최소 3대의 iPad에서 반복**

멀티태스킹 카메라 접근은 기기 세대에 따라 지원 여부가 갈린다. **최신 세대 1대 이상, 구형 세대 1대 이상**을 반드시 포함해 Step 2를 반복하고 표에 행을 추가한다.

구형 iPad에서 `isMultitaskingCameraAccessSupported=false` 가 나오는 것은 정상이며, 그 경우 `PiP 중 프레임/3초` 가 `0`이 되는 것이 설계 §5.2의 "미지원 기기는 오디오만 폴백" 근거가 된다.

- [ ] **Step 5: 커밋**

```bash
git add spikes/ios-pip-spike docs/superpowers/specs/phase0-poc-results.md
git commit -m "spike(ios): measure camera frame continuity during PiP across iPad models"
```

---

## Part D — 결론

### Task 12: PoC 결과 판정과 설계 문서 반영

**Files:**
- Modify: `docs/superpowers/specs/phase0-poc-results.md`
- Modify: `docs/superpowers/specs/2026-08-06-studymeet-video-tutoring-design.md`

**Interfaces:**
- Consumes: Task 6, Task 11의 측정 결과
- Produces: Phase 1 착수 가부 판정

- [ ] **Step 1: 결론 섹션을 채운다**

`docs/superpowers/specs/phase0-poc-results.md` 의 "결론" 체크박스를 실제 측정에 근거해 표시한다. 측정하지 않은 항목을 추정으로 채우지 않는다. 미검증은 미검증으로 남긴다.

- [ ] **Step 2: 설계 문서에 검증 결과를 반영**

`docs/superpowers/specs/2026-08-06-studymeet-video-tutoring-design.md` 의 **§11.1 Phase 0** 표에 각 항목의 실제 결과를 한 줄씩 덧붙인다. 결과가 설계를 바꾸는 경우 해당 섹션도 함께 고친다.

판정별 대응:

| 측정 결과 | 설계 반영 |
|---|---|
| Android PIP 중 카메라 유지 확인 | §5.1 유지. Phase 1 착수 |
| Android 특정 OEM에서만 실패 | §5.1에 해당 기기 예외와 폴백(오디오만)을 명시 |
| Android 전 기기에서 실패 | §5.1 재설계 필요. **Phase 1 착수 보류** |
| iPad 최신 세대에서 PiP 중 카메라 유지 확인 | §5.2 유지. 지원 기기 목록을 §5.2에 추가 |
| iPad 전 세대 실패, 또는 Task 8 Step 2가 (다) | §5.2를 "iPad는 오디오만 유지"로 변경하고, §12 오픈 이슈에 "LiveKit Swift SDK 포크 또는 커스텀 캡처러 필요" 추가 |
| Task 8 Step 5에서 Apple 별도 신청이 필요한 엔터틀먼트로 확인 | §11.2 Phase 계획에 신청 리드타임 반영 |

- [ ] **Step 3: 커밋**

```bash
git add docs/superpowers/specs
git commit -m "docs: record Phase 0 PoC results and reflect them in the design"
```

- [ ] **Step 4: Phase 1 착수 가부 보고**

다음 형식으로 한 문단 보고한다. 추정 금지, 측정값만 인용한다.

```
Phase 0 결과
- Android: <기기 수>대 검증, PIP 중 프레임/3초 = <값 목록>. 판정: 유지됨 / 부분 / 실패
- iPad:    <기기 수>대 검증, PiP 중 프레임/3초 = <값 목록>. 판정: 유지됨 / 부분 / 실패 / 미검증
- 설계 변경: <있음(어느 섹션) / 없음>
- Phase 1 착수: 가능 / 보류(사유)
```

---

## 부록 — Phase 0에서 하지 않는 것

다음은 이 계획의 범위가 아니다. 각각 별도 Phase에서 다룬다.

| 항목 | 담당 Phase |
|---|---|
| KMP 프로젝트 구조 전환, `expect`/`actual` 정의 | Phase 1 |
| Android 화면 고정(`startLockTask`) | Phase 2 |
| 이탈 상태 모델과 DataChannel 통보 | Phase 2 |
| 리허설 온보딩, 대기실 | Phase 3 |
| Camera Arbiter, 사진 촬영·업로드 | Phase 4 |
| 학습 화면 가안, 페이지 동기화, 포인터 | Phase 5 |
| LiveKit 셀프호스팅, 3,000방 부하 테스트 | Phase 6 |

스파이크 코드(`spike-android/`, `spikes/ios-pip-spike/`)는 Phase 1 착수 시점에 삭제한다. 남길 것은 `phase0-poc-results.md` 의 측정값뿐이다.
