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

| type | 의미 |
|---|---|
| `host` | 같은 LAN 직결 |
| `srflx` | NAT 통과 직결 (STUN) |
| `relay` | **TURN 중계** — 서버 대역폭을 먹는 세션 |
| `TYPE_UNKNOWN` | candidate pair는 찾았지만 `candidateType` 필드를 읽지 못함 (구현 결함 의심) |
| `NONE_FOUND` | `iceConnectionState=CONNECTED` 인데 `succeeded` 상태의 candidate-pair가 통계에 없음 (구현 결함 의심) |

`relay` 비율이 곧 설계 §3.1의 릴레이 비율이다.
