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
