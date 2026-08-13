# 시그널링 스파이크 서버

Phase 0 전용. 인증 없음, 영속성 없음, 인스턴스 1대 전제.

## 어느 실행 방법을 쓸 것인가

| 상황 | 방법 |
|---|---|
| 태블릿과 PC가 **같은 네트워크**에 있다 | 아래 "로컬 실행". TURN 없이 host 후보로 붙는다 |
| 태블릿을 **USB로만** 연결했다 | 아래 "로컬 실행" + `adb reverse tcp:8081 tcp:8081`. 시그널링만 통하고, 미디어는 두 기기가 같은 망에 있을 때만 붙는다 |
| 태블릿과 선생님 PC가 **서로 다른 망**에 있다 | [`deploy/README.md`](deploy/README.md). 공인 IP VM에 시그널링과 TURN을 함께 올린다. 로컬 실행으로는 불가능하다 |

마지막 경우가 실제 제품 조건이다. 개발 PC는 사내망 NAT 뒤에 있어 태블릿에서 도달하지
못하므로, TURN을 PC에 띄워도 소용이 없다.

## 로컬 실행

    cd signaling
    npm install
    npm start

`ws://<PC의 LAN IP>:8080/?room=phase0` 으로 접속한다.

8080이 이미 쓰이고 있으면 `PORT=8081 npm start` 처럼 바꿔서 띄운다. 확인:

    netstat -ano | findstr :8080     # Windows
    lsof -i :8080                    # macOS
태블릿에서 붙으려면 PC와 같은 네트워크에 있어야 하고, PC 방화벽에서 8080 포트를 열어야 한다.

LAN IP 확인:
- Windows: `ipconfig` 의 IPv4 주소
- macOS: `ipconfig getifaddr en0`

## 선생님 화면 (측정용)

서버를 띄운 뒤 브라우저에서 연다:

    http://<PC의 LAN IP>:8080/teacher.html?room=phase0&role=callee

태블릿은 `role=caller` 로 붙인다. role을 잘못 주면 두 가지로 실패한다:

| 조합 | 증상 |
|---|---|
| 양쪽 다 `caller` | offer가 두 개 나가 협상이 깨진다. 로그에 오류가 남는다 |
| 양쪽 다 `callee` (또는 role 생략) | **아무 일도 일어나지 않는다.** 누구도 offer를 만들지 않아 `ICE 상태` 가 `-` 에서 멈춘 채 조용히 대기한다. 오류가 안 나므로 더 헷갈린다 |

TURN을 쓰려면 쿼리로 넘긴다 (**페이지에 하드코딩하지 않는다**):

    ...&turn=turn:<IP>:3478&turnUser=spike&turnPass=<값>

> ⚠️ 이 URL은 **비밀번호를 평문으로 담고 있다.** 브라우저 기록과 주소창에 그대로 남는다.
> 측정 세션을 화면 녹화하거나 스크린샷을 찍는다면 주소창이 잡히지 않게 하고, 측정이 끝나면
> 브라우저 기록을 지운다. 스파이크용 임시 자격증명만 쓰고 재사용하지 않는다.

브라우저가 `getUserMedia` 를 허용하려면 **localhost 이거나 HTTPS** 여야 한다. LAN IP + 평문 HTTP 로
열면 카메라 권한이 거부된다. 우회 방법은 아래 "브라우저 보안 컨텍스트" 절 참조.

## 프로토콜

같은 `room` 의 두 참가자 사이에서 받은 텍스트를 그대로 상대에게 전달한다.
서버가 스스로 만들어 보내는 메시지는 두 가지뿐이다.

| 메시지 | 시점 |
|---|---|
| `{"type":"ready"}` | 두 번째 참가자가 입장해 협상을 시작해도 될 때 |
| `{"type":"peer-left"}` | 상대가 나갔을 때 |

**`role=caller|callee` 는 서버가 보지 않는다.** URL에 붙여도 서버는 `room` 만 읽고 `role` 은 무시한다.
누가 offer를 만들지는 **클라이언트가 자기 URL을 보고 스스로 정한다.** 서버에 역할 개념이 없으므로,
양쪽이 모두 `caller` 로 설정되면 offer가 두 개 날아가 협상이 깨진다. 두 기기에 서로 다른 role을 주는 것은
사람의 책임이다.

클라이언트가 주고받는 메시지는 서버가 해석하지 않는다:
`{"type":"offer","sdp":...}`, `{"type":"answer","sdp":...}`,
`{"type":"candidate","candidate":...,"sdpMid":...,"sdpMLineIndex":...}`

## 브라우저 보안 컨텍스트

`getUserMedia` 는 보안 컨텍스트에서만 동작한다. `http://<LAN IP>:8080` 은 해당되지 않는다.
스파이크에서는 셋 중 하나를 쓴다.

1. **Chrome 플래그** (가장 간단) — 측정용 프로필에서만 켠다:

       chrome.exe --unsafely-treat-insecure-origin-as-secure=http://<LAN IP>:8080 --user-data-dir=%TEMP%\studymeet-spike

2. **포트 포워딩** — 노트북에서 `chrome://inspect` 의 Port forwarding 으로 `8080` 을 태블릿에 넘기고
   양쪽 다 `http://localhost:8080` 으로 접속한다.
3. **자체 서명 인증서로 HTTPS** — 가장 번거롭다. 마지막 수단.

1번을 쓸 때는 **반드시 별도 `--user-data-dir` 로 띄운다.** 평소 쓰는 브라우저 프로필에
이 플래그를 걸면 안 된다.
