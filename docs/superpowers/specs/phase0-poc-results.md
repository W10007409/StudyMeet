# Phase 0 PoC 검증 결과

- 검증 시작일: (실기기 확보 후 기입)
- LiveKit Cloud 프로젝트: (프로젝트명만. URL·키는 여기 적지 않는다)

이 문서는 Phase 0의 **유일한 산출물**이다. 스파이크 코드는 Phase 1에서 폐기되고 여기 적힌 숫자만 남는다.
측정하지 않은 칸은 비워 둔다. 추정치를 채우지 않는다.

---

## B. Android — PIP 중 카메라 유지

측정 절차: `docs/superpowers/plans/2026-08-06-phase0-pip-camera-poc.md` Task 5 Step 2, Task 6 Step 3~4.

`PIP 중 프레임/3초` 는 `adb logcat -d -s PipSpike` 에 찍히는 `PIP frames: ... delta=<값>` 의 `delta` 를 그대로 옮긴다.
판정 기준은 **30 이상**(24fps 기준 72프레임의 약 40%).

| 기기 | OS 버전 | 제조사 | PIP 진입 | PIP 중 프레임/3초 | 화면 꺼짐 시 카메라 중단 | PIP 상태에서 화면 꺼짐 | 비고 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
| | | | | | | | |
| | | | | | | | |

> 최소 구성: Android 14 / 15 / 16 각 1대, 그중 삼성 Galaxy Tab 최소 1대 (OEM 차이 확인용).

## C. iPad — 멀티태스킹 카메라 접근 + 화상통화 PiP

측정 절차: 같은 계획 Task 8 Step 4, Task 10 Step 4, Task 11 Step 2.

| 기기 | iPadOS | isMultitaskingCameraAccessSupported | PiP 진입 | PiP 중 프레임/3초 | 비고 |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |

> 최신 세대 1대 이상 + 구형 세대 1대 이상 필수. 구형에서 `false` 가 나오는 것은 정상이며, 그것이 설계 §5.2의 "미지원 기기는 오디오만 폴백" 근거가 된다.

### C 전용 기록 항목

- ~~**Task 8 Step 2** — LiveKit Swift SDK의 `AVCaptureSession` 접근 경로~~ → **소스 확인으로 해소됨 (2026-08-06).** `CameraCapturer.captureSession`, `isMultitaskingAccessSupported`, `isMultitaskingAccessEnabled` 모두 공개 API. SDK 포크 불필요.
- ~~**Task 9 Step 1** — `VideoFrame` 에서 `CVPixelBuffer` 를 얻는 경로~~ → **불필요해짐.** `VideoView.renderMode = .sampleBuffer` 후 `VideoView.avSampleBufferDisplayLayer` 로 레이어를 직접 얻는다. 커스텀 렌더러 미작성.
- **Task 8 Step 5 판정** — `Multitasking Camera Access` 엔터틀먼트 필요 여부, Apple 별도 신청 필요 여부: (실기기에서 확인)
- **`capturer` 도달 경로** — `LocalVideoTrack` 에서 `CameraCapturer` 를 얻는 실제 프로퍼티 경로 (빌드하며 확정):

---

## 이 측정이 답해주지 **않는** 것

Task 12에서 결과를 과대해석하지 않도록 미리 적어 둔다.

1. **테스트는 홈 버튼을 누르지 않는다.** `PipCameraSurvivalTest` 는 포그라운드 상태의 Activity에서 `enterPipNow()` 를 직접 호출한다. 아이가 홈을 눌러 런처가 전면으로 올라오는 전이와는 다른 경로다. 홈 버튼 경로는 육안 절차(Task 4 Step 3)로만 덮인다.
2. **테스트는 포그라운드 서비스가 필요하다는 것을 증명하지 못한다.** PIP는 visible 상태라 FGS가 없어도 카메라 접근이 유지될 수 있다. `ClassForegroundService` 를 지운 빌드도 이 테스트를 똑같이 통과할 가능성이 크다. 설계 §5.1은 FGS가 필수라는 전제 위에 서 있으므로, **FGS를 제거한 빌드로 한 번 더 측정해 대조**해야 그 전제가 검증된다.
3. **PIP 창의 `RemoteAction` "수업으로 돌아가기" 버튼은 구현되지 않았다.** 카메라 생존과 무관해 Phase 0 범위에서 뺐다. Phase 2에서 삼성 기기 대상 확인 필요.

---

## 결론

- [ ] Android: PIP 중 카메라 유지 확인됨 / 확인 실패 / 미검증
- [ ] Android: 화면 꺼짐 시 카메라 중단 확인됨 / 확인 실패 / 미검증
- [ ] Android: **FGS 제거 빌드 대조 측정** — 포그라운드 서비스가 실제로 필요함 / 없어도 유지됨 / 미검증
- [ ] iPad: PiP 중 카메라 유지 확인됨 / 확인 실패 / 미검증
- [x] iOS SDK 능력 확인 — **소스로 해소됨.** `AVCaptureSession` 접근과 PiP용 레이어 모두 LiveKit Swift 2.16.0의 공개 API. SDK 포크 불필요

## 설계 영향

(측정 결과가 `2026-08-06-studymeet-video-tutoring-design.md` 의 §5.1 / §5.2 / §11 을 바꾸는지 여기 기록)
