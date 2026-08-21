# StudyMeet Child App (KMP)

아이(학생) 화면 - Kotlin Multiplatform 프로젝트

## 🎯 목표

- Android + iOS 지원
- WebRTC 화상 통화
- Picture in Picture (PiP) 지원
- 방 코드 기반 입장
- 패드 메시지 통신

## 📱 지원 플랫폼

- **Android**: API 24+
- **iOS**: 12.0+

## 🚀 프로젝트 구조

```
child-app/
├── shared/              # Kotlin Multiplatform 공유 코드
│   └── build.gradle.kts
├── androidApp/          # Android 앱
│   ├── build.gradle.kts
│   └── src/
│       ├── main/
│       │   ├── kotlin/
│       │   │   ├── MainActivity.kt
│       │   │   ├── webrtc/
│       │   │   │   └── WebRTCClient.kt
│       │   │   ├── signaling/
│       │   │   │   └── SignalingClient.kt
│       │   │   └── util/
│       │   │       └── PiPManager.kt
│       │   ├── AndroidManifest.xml
│       │   └── res/
│       │       ├── layout/
│       │       │   └── activity_main.xml
│       │       └── values/
│       │           ├── strings.xml
│       │           ├── colors.xml
│       │           └── themes.xml
│       └── test/
└── iosApp/              # iOS 앱 (추후 개발)
```

## 📋 필수 요구사항

- Android Studio 2023.1 이상
- Gradle 8.0+
- Kotlin 1.9.20+
- JDK 11+

## 🔧 빌드 및 실행

### Android 빌드

```bash
cd child-app
./gradlew :androidApp:build

# 실행
./gradlew :androidApp:installDebug
```

### 개발 중 실시간 빌드

```bash
./gradlew :androidApp:run
```

## 🎥 주요 기능

### WebRTC 화상 통화
- 카메라 및 마이크 자동 감지
- 음향 소거(echo cancellation)
- 잡음 감소(noise suppression)
- 자동 게인 제어(auto gain control)

### Picture in Picture (PiP)
- Android 8.0 이상에서 자동 PiP 지원
- 홈 버튼 클릭 시 자동 PiP 진입
- 사용자가 언제든 PiP 전환 가능

### 패드 메시지
- DataChannel을 통한 실시간 메시지 전송
- 선생님의 메시지 수신 및 표시

### 방 코드 시스템
- 방 코드로 쉽게 입장
- WebSocket을 통한 Signaling
- 자동 WebRTC 연결

## 🧪 테스트

### 필수 테스트 항목

- [ ] **화상 통화**
  - [ ] 카메라 활성화 확인
  - [ ] 마이크 활성화 확인
  - [ ] 선생님과 연결 확인
  - [ ] 양방향 영상 표시

- [ ] **PiP 기능**
  - [ ] 홈 버튼 누를 시 PiP 진입
  - [ ] PiP 모드에서 통화 계속 진행
  - [ ] PiP 크기 조절
  - [ ] PiP에서 앱으로 복귀

- [ ] **제어 버튼**
  - [ ] 카메라 ON/OFF
  - [ ] 마이크 ON/OFF
  - [ ] 나가기 버튼

- [ ] **패드 메시지**
  - [ ] 메시지 수신 확인
  - [ ] 메시지 표시

## 📲 권한 요구

```xml
<!-- 필수 -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />
```

## 🔌 환경 변수

`local.properties` 또는 빌드 중 설정:

```properties
# Signaling 서버
SIGNALING_URL=ws://192.168.15.137:8080
```

## 🐛 디버깅

### 로그 확인

```bash
adb logcat | grep WebRTCClient
adb logcat | grep SignalingClient
adb logcat | grep PiPManager
```

### 전체 로그

```bash
adb logcat com.studymeet.child:V
```

## 📝 주요 클래스

### `WebRTCClient`
- WebRTC 연결 관리
- 카메라/마이크 제어
- 원격 스트림 수신

### `SignalingClient`
- WebSocket 통신
- Offer/Answer 교환
- ICE Candidate 처리

### `PiPManager`
- PiP 모드 진입/종료
- 자동 PiP 트리거

## 🚧 iOS 구현 (추후)

iOS 앱은 KMP의 shared 모듈을 활용하여:
- SwiftUI로 UI 구현
- WebRTC 비디오 렌더링
- AVPiP API를 통한 PiP 지원

## 📞 연락처 및 이슈

이슈나 질문은 프로젝트 이슈 트래커를 통해 보고해주세요.

## 📄 라이센스

StudyMeet 프로젝트의 일부
