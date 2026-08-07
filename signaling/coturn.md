# coturn (TURN 서버) 스파이크 설정

> **이 문서는 스파이크 전용이다. 프로덕션 배포 가이드가 아니다.**
> 여기 적힌 설정(`--no-tls --no-dtls`, 평문 3478 포트)은 릴레이 비율을 측정하기 위한
> 로컬/임시 서버용이다. 운영 배포에는 그대로 쓸 수 없다.

## Docker로 띄우기

    docker run -d --network=host \
      -e TURN_USER=spike -e TURN_PASS=<임의의 값> \
      coturn/coturn \
      -n --lt-cred-mech --fingerprint \
      --user=spike:<임의의 값> \
      --realm=studymeet.local \
      --listening-port=3478 \
      --no-tls --no-dtls

**운영에서는 TLS 443이 필수다 (설계 §3.1).** 스파이크에서는 평문 3478로 충분하다.
이 차이를 없애고 그대로 배포하면 안 된다 — 이 문서는 그 절차를 다루지 않는다.

## 자격증명은 커밋하지 않는다

`local.properties` 에만 둔다. 이 파일은 `.gitignore` 에 포함되어 있다.

    turn.url=turn:<서버 IP>:3478
    turn.user=spike
    turn.pass=<임의의 값>

`turn.url` 이 비어 있으면 앱은 STUN만으로 빌드/동작한다 (TURN은 빌드 타임에 선택적이다).

## 릴레이 여부 판별

`adb logcat -d -s PipSpike` 의 `selectedCandidatePair` 로그에서 `localType` 값을 본다.

WebRTC는 가능한 로컬×원격 후보 조합마다 연결성 검사를 돌리므로, STUN과 TURN 후보를 동시에
제공하는 이 토폴로지에서는 `candidate-pair`가 여러 개 `succeeded` 상태로 나올 수 있다. 실제로
미디어를 나른 pair는 `nominated=true` 인 pair뿐이다. 그래서 로그 한 줄이 항상 그 판정을 담고
있는 건 아니다 — `nominated=true` 가 붙은 줄만 단독 정답으로 세고, `ambiguous=true` 가 붙은
줄들은 (같은 `succeededPairs` 묶음 안에서) 후보로만 취급한다.

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
| `nominated=true` | 이 pair가 실제로 미디어를 실어나른 pair로 확인됨 — 이 줄이 단독 정답 |
| `nominated=unknown` | 이 libwebrtc 빌드에서 `nominated` 키가 없거나 신뢰할 수 없어서, 어떤 succeeded pair가 진짜인지 판별 불가 |
| `ambiguous=true` | 이 줄 하나만으로 판정하면 안 됨 — 같은 `succeededPairs` 개수를 가진 다른 줄들과 함께 봐야 함 |
| `succeededPairs=<n>` | 그 순간 `state=succeeded` 로 보고된 candidate-pair 총 개수 |
| `nominatedPairs=<n>` | (다중 nominated 케이스에서만) `nominated=true` 로 보고된 pair 개수 |

`nominated=true` 이거나 (ambiguous 묶음에서) 유일하게 `relay` 인 pair의 비율이 곧 설계 §3.1의
릴레이 비율이다. `ambiguous=true` 줄들만 있는 연결은 자동 집계에서 빼고 별도로 표시한다.
