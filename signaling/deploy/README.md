# 공개 호스트 배포 (Phase 0 스파이크)

> **스파이크 전용이다. 프로덕션 배포 가이드가 아니다.** 인증도, 이중화도, 백업도 없다.
> 목적은 하나다: 서로 다른 망에 있는 태블릿과 선생님 PC가 실제로 연결되는지, 그리고
> 그중 몇 %가 TURN 릴레이를 타는지를 측정하는 것.

## 왜 이 VM이 필요한가

측정 중 확인된 사실이다.

- 태블릿 라우팅 테이블에는 `192.168.15.0/24 dev wlan0` 하나뿐이고, 선생님 PC의 사내망
  주소(`10.145.164.x`)로 가는 경로가 없다. 태블릿에서 PC는 **도달 불가**다.
- 두 기기 모두 인터넷은 된다 (태블릿은 Google STUN에서 srflx 후보를 받아냈다).

**TURN은 서로 못 닿는 두 망을 잇는 마법이 아니다.** TURN이 동작하려면 *양쪽 모두가
도달할 수 있는 호스트*가 있어야 한다. 개발 PC는 사내망 NAT 뒤에 있어 그 호스트가 될 수
없다. 그래서 공인 IP를 가진 VM 하나에 시그널링과 TURN을 함께 올린다.

## 구성

```
             태블릿 (가정 와이파이)          선생님 PC (사내망)
                    │                              │
                    └───────── 443/TLS ────────────┘
                                  │
                          [ VM · 공인 IP ]
                                  │
                              haproxy :443
                        SNI 로만 두 갈래로 나눔
                    ┌─────────────┴─────────────┐
            turn.<도메인>                  sig.<도메인>
                    │                             │
              coturn :5349                   nginx :8443
             (TLS 종단, 릴레이)              (TLS 종단, WSS)
                                                  │
                                          signaling :8080
```

**443 하나를 둘이 나눠 쓰는 이유:** 사내망은 보통 443 외의 포트와 UDP를 막는다. 검증하려는
조건이 바로 그것이므로, 둘 중 하나라도 다른 포트로 옮기면 측정 대상이 사라진다. haproxy는
TLS를 벗기지 않고 ClientHello의 SNI만 보고 넘긴다 (passthrough).

## 사전 준비

1. **공인 IP를 가진 리눅스 VM** 1대. Docker와 Docker Compose 설치.
2. **DNS 레코드 2개**를 VM 공인 IP로 향하게 한다:
   - `turn.<도메인>`
   - `sig.<도메인>`
3. **방화벽/보안그룹 인바운드**:

   | 포트 | 프로토콜 | 용도 |
   |---|---|---|
   | 80 | TCP | Let's Encrypt HTTP-01 인증 (발급·갱신 시에만) |
   | 443 | TCP | haproxy — TURN over TLS + 시그널링 WSS |
   | 49160–49200 | UDP | TURN 릴레이 |

   `turnserver.conf` 의 `min-port`/`max-port` 와 이 범위가 반드시 일치해야 한다.

## 배포

```bash
git clone <repo> && cd signaling/deploy
cp .env.example .env
# TURN_PASS, PUBLIC_IP, PRIVATE_IP 를 채운다. PRIVATE_IP 는 `ip -4 addr` 로 확인.
$EDITOR .env

# 인증서 발급. haproxy 가 아직 80 을 쓰지 않으므로 standalone 으로 받는다.
docker compose run --rm certbot certonly --standalone \
  --cert-name studymeet \
  -d turn.<도메인> -d sig.<도메인> \
  --agree-tos -m <이메일> --non-interactive

docker compose up -d --build
docker compose logs -f
```

인증서 갱신은 cron에 건다. 갱신 중 80 포트를 잠깐 쓰므로 haproxy와 충돌하지 않는다
(haproxy는 443만 바인딩한다).

```
0 4 * * 1 cd /path/to/signaling/deploy && docker compose run --rm certbot renew && docker compose restart coturn nginx
```

## 앱·브라우저 설정

**`local.properties`** (커밋 금지):

```properties
signaling.url=wss://sig.<도메인>/?room=phase0&role=caller
turn.url=turns:turn.<도메인>:443?transport=tcp
turn.user=studymeet
turn.pass=<.env 의 TURN_PASS>
```

다시 빌드해서 넣는다:

```
./gradlew :spike-android:installDebug
```

**선생님 페이지** — TURN 자격증명은 쿼리로 넘긴다 (페이지에 하드코딩하지 않는다).
`turn` 값 안의 `?` 와 `=` 는 반드시 URL 인코딩한다. 안 하면 `transport=tcp` 가 페이지의
별도 쿼리 파라미터로 잘려나가고, TURN이 UDP로 시도되어 사내망에서 조용히 실패한다.

```
https://sig.<도메인>/teacher.html?room=phase0&role=callee&turn=turns%3Aturn.<도메인>%3A443%3Ftransport%3Dtcp&turnUser=studymeet&turnPass=<값>
```

> ⚠️ 이 URL은 **비밀번호를 평문으로 담고 있다.** 브라우저 기록과 주소창에 남는다. 측정
> 세션을 녹화한다면 주소창이 잡히지 않게 하고, 끝나면 기록을 지운다. 스파이크 전용
> 자격증명만 쓰고 재사용하지 않는다.

## 연결 확인

```bash
# TURN 이 443 에서 TLS 로 응답하는지 (SNI 가 맞아야 haproxy 가 coturn 으로 보낸다)
openssl s_client -connect turn.<도메인>:443 -servername turn.<도메인> </dev/null

# 시그널링이 같은 포트에서 HTTPS 로 응답하는지
curl -sI https://sig.<도메인>/teacher.html | head -1

# 할당(allocation)이 실제로 생기는지
docker compose logs coturn | grep -i allocat
```

앱 쪽 판정은 `adb logcat -s PipSpike` 의 `selectedCandidatePair` 로그로 한다. 읽는 규칙과
릴레이 비율 집계 규칙은 [`../coturn.md`](../coturn.md) 에 있다.

## 이 구성이 측정하지 못하는 것

- **선생님 PC가 사내망에서 실제로 443을 나갈 수 있는지**는 이 VM이 아니라 사내 방화벽
  정책이 정한다. 실패하면 코드 문제가 아니므로 인프라 팀과 확인한다.
- coturn을 이 한 대에만 두므로 **지역별 지연 차이**는 측정되지 않는다.
- `no-tls` 평문 경로를 열지 않았으므로 **평문 3478이 열려 있었다면 붙었을 세션**은
  릴레이 비율에 잡히지 않는다. 의도한 것이다 — 운영은 443/TLS만 쓴다 (설계 §3.1).
