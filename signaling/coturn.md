# coturn (TURN 서버) 스파이크 설정

> **이 문서는 스파이크 전용이다. 프로덕션 배포 가이드가 아니다.**
> 목적은 릴레이 비율 측정 하나다.

## 어디에 띄우는가

**개발 PC에는 띄울 수 없다.** 태블릿(가정 와이파이)에서 사내망 PC로 가는 경로가 없기
때문이다. TURN은 서로 못 닿는 두 망을 잇는 마법이 아니라, *양쪽 모두가 도달할 수 있는
호스트*가 있어야 동작한다. 그래서 공인 IP를 가진 VM에 시그널링과 함께 올린다.

구성·발급·기동 절차는 [`deploy/README.md`](deploy/README.md) 에 있다. 리스닝은
**443 TCP + TLS 하나뿐**이다 (설계 §3.1). 사내망이 443 외의 포트와 UDP를 막는 것이
검증 대상이므로 평문 3478은 열지 않는다.

## 자격증명은 커밋하지 않는다

서버 쪽은 `signaling/deploy/.env`, 앱 쪽은 `local.properties` 에만 둔다. 둘 다
`.gitignore` 에 포함되어 있다.

    turn.url=turns:turn.<도메인>:443?transport=tcp
    turn.user=studymeet
    turn.pass=<임의의 값>

`turn.url` 이 비어 있으면 앱은 STUN만으로 빌드/동작한다 (TURN은 빌드 타임에 선택적이다).
그 상태에서는 서로 다른 망에 있는 두 기기가 붙지 않는 것이 정상이다 — 코드 결함이 아니다.

## 릴레이 여부 판별

`adb logcat -d -s PipSpike` 의 `selectedCandidatePair` 로그에서 `localType` 값을 본다.

WebRTC는 가능한 로컬×원격 후보 조합마다 연결성 검사를 돌리므로, STUN과 TURN 후보를 동시에
제공하는 이 토폴로지에서는 `candidate-pair`가 여러 개 `succeeded` 상태로 나올 수 있다. 실제로
미디어를 나른 pair는 `nominated=true` 인 pair뿐이다. 그래서 로그 한 줄이 항상 그 판정을 담고
있는 건 아니다 — `nominated=true` 이면서 `ambiguous=true` 가 아닌 줄만 단독 정답으로 세고,
`ambiguous=true` 가 붙은 줄들은 (nominated 값과 무관하게, 같은 `succeededPairs` 묶음 안에서)
후보로만 취급한다. 여러 pair가 동시에 nominated로 보고되는 경우 `nominated=true` 인 줄들도
`ambiguous=true` 를 함께 달고 나오므로 그중 어느 하나도 단독 정답이 아니다 — 정확한 우선순위는
아래 "릴레이 비율 집계 규칙"을 따른다.

| type | 의미 |
|---|---|
| `host` | 같은 LAN 직결 |
| `srflx` | NAT 통과 직결 (STUN) |
| `prflx` | peer-reflexive — 협상 도중 NAT가 주소를 재작성해서 발견된 직결 후보. TURN을 거치지 않으므로 릴레이 비율 계산 시 `srflx`와 함께 "직결"로 센다 |
| `relay` | **TURN 중계** — 서버 대역폭을 먹는 세션 |
| `TYPE_UNKNOWN` | candidate pair는 찾았지만 `candidateType` 필드를 읽지 못함 (구현 결함 의심) |
| `NONE_FOUND` | `iceConnectionState=CONNECTED` 인데 `succeeded` 상태의 candidate-pair가 통계에 없음, peerConnection이 이미 release됐음, 또는 `getStats` 호출/콜백이 예외로 실패함 (`reason=` 필드로 구분) |

로그 줄에 딸린 필드:

| field | 의미 |
|---|---|
| `nominated=true` | 이 pair가 실제로 미디어를 실어나른 pair로 확인됨 — `ambiguous=true` 가 함께 붙지 않은 경우에만 이 줄이 단독 정답 (여러 pair가 동시에 nominated면 `ambiguous=true` 도 함께 붙으며, 그때는 아래 집계 규칙을 따른다) |
| `nominated=unknown` | 이 libwebrtc 빌드에서 `nominated` 키가 없거나 신뢰할 수 없어서, 어떤 succeeded pair가 진짜인지 판별 불가 |
| `ambiguous=true` | 이 줄 하나만으로 판정하면 안 됨 — 같은 `succeededPairs` 개수를 가진 다른 줄들과 함께 봐야 함 |
| `succeededPairs=<n>` | 그 순간 `state=succeeded` 로 보고된 candidate-pair 총 개수 |
| `nominatedPairs=<n>` | (다중 nominated 케이스에서만) `nominated=true` 로 보고된 pair 개수 |

**릴레이 비율 집계 규칙 (하나만 따른다):**

- 분모·분자는 **`nominated=true` 이면서 `ambiguous=true` 가 아니고 `localType=TYPE_UNKNOWN` 도
  아닌** 줄만으로 센다. 분자는 그중 `localType=relay`, 분모는 그런 줄 전체다. (`srflx`/`prflx`는
  위 표대로 직결로 센다 — 릴레이가 아니다.)
- `ambiguous=true` 가 붙은 연결은 **자동 집계에서 제외**하고 "판정 불가" 개수로 따로 기록한다.
  ambiguous 묶음 안에 `relay` 타입이 하나뿐이더라도 그것을 정답으로 추측해서 세지 않는다 —
  `ambiguous=true` 는 애초에 그 판단을 할 수 없다는 뜻이다. `ambiguous=true` 줄들이 같은
  `succeededPairs=<n>` 값을 갖고 연속된 두 `iceConnectionState=` 전이 사이에 있으면 **한 연결**
  이므로 한 번만 센다.
- `localType=NONE_FOUND` 도 마찬가지로 집계에서 제외하고 따로 센다.
- `localType=TYPE_UNKNOWN` 도 마찬가지로 집계에서 제외하고 따로 센다 — `nominated=true` 이고
  `ambiguous=true` 가 아니어도, candidateType을 읽지 못한 것 자체가 구현 결함 의심이므로 "relay
  아님"으로 세면 안 된다.
- 판정 불가(ambiguous + NONE_FOUND + TYPE_UNKNOWN) 비율이 높으면 그 자체가 결과다 — 측정 방법을
  고쳐야 한다는 신호이며, 그 상태로 릴레이 비율 숫자만 뽑아 보고하면 안 된다.

`iceConnectionState=CONNECTED` 는 찍혔는데 뒤따르는 `selectedCandidatePair` 줄이 없으면
측정이 유실된 것이므로 (getStats 콜백이 비동기로 오는 도중 release로 유실됨) 그 조합을
다시 돌린다.
