# 빠른 시작 가이드 - Child App

## 🎯 5분 안에 시작하기

### 1. 프로젝트 빌드

```bash
cd child-app
./gradlew :androidApp:assembleDebug
```

### 2. 패드에 설치

```bash
# 연결된 Android 기기 확인
adb devices

# 앱 설치
./gradlew :androidApp:installDebug
```

### 3. 앱 실행

패드의 홈 화면에서 "StudyMeet 아이" 앱 실행

### 4. 테스트

**선생님 준비 (Teacher Web)**
```
http://192.168.15.137:5174
방 코드 입력: test-class-001
```

**아이 입장 (Child App)**
- 방 코드 입력: test-class-001
- 입장 버튼 클릭

**결과 확인**
- ✅ 상대방 영상 표시
- ✅ 내 영상 표시
- ✅ 연결 상태 "연결됨" 표시

## 🎥 PiP 테스트

1. 앱 실행 중 홈 버튼 클릭
2. 화면 우측 하단에 PiP 윈도우 표시
3. PiP 윈도우 크기 조절 가능
4. 다른 앱 사용 중에도 통화 계속됨

## 🔌 주요 포트

| 서비스 | URL |
|--------|-----|
| Signaling | ws://192.168.15.137:8080 |
| Teacher Web | http://192.168.15.137:5174 |

## 🆘 문제 해결

### 권한 오류
```
permission denied
```
→ 앱 설정에서 카메라 및 마이크 권한 허용

### 연결 안 됨
```
WebSocket 오류: Connection refused
```
→ Signaling 서버 실행 확인: `./manage-services.sh status`

### 화면 검은색
```
영상이 표시되지 않음
```
→ 카메라 사용 중인 다른 앱 종료

## 📱 기기 요구사항

- Android 7.0 이상 (PiP는 8.0 이상)
- 카메라 및 마이크 필수
- 최소 2GB RAM
- Wi-Fi 또는 모바일 데이터

## 🚀 다음 단계

1. ✅ 기본 기능 테스트 완료
2. 🔜 iOS 앱 개발
3. 🔜 추가 기능 (텍스트 채팅, 화면 공유 등)

---

더 자세한 내용은 [README.md](README.md)를 참고하세요.
