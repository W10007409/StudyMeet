# 시그널링 스파이크 서버

Phase 0 전용. 인증 없음, 영속성 없음, 인스턴스 1대 전제.

## 실행

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

태블릿은 `role=caller` 로 붙인다. 두 쪽 role이 같으면 offer가 두 개 나가 협상이 깨진다.

TURN을 쓰려면 쿼리로 넘긴다 (**페이지에 하드코딩하지 않는다**):

    ...&turn=turn:<IP>:3478&turnUser=spike&turnPass=<값>

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
