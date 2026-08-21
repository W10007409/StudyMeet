# StudyMeet 서비스 관리 가이드

이 문서는 StudyMeet 프로젝트의 서비스를 시작, 중지, 재시작하는 방법을 설명합니다.

## 🚀 빠른 시작

### 1. 첫 실행 (초기 설정)

```bash
# 의존성 설치 및 환경 설정
./manage-services.sh setup

# 모든 서비스 시작
./manage-services.sh start
```

### 2. 서비스 상태 확인

```bash
./manage-services.sh status
```

### 3. 서비스 중지

```bash
./manage-services.sh stop
```

### 4. 서비스 재시작

```bash
./manage-services.sh restart
```

---

## 📋 전체 명령어 목록

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `setup` | 의존성 설치 및 환경설정 초기화 | `./manage-services.sh setup` |
| `start` | 모든 서비스 시작 | `./manage-services.sh start` |
| `stop` | 모든 서비스 중지 | `./manage-services.sh stop` |
| `restart` | 모든 서비스 재시작 | `./manage-services.sh restart` |
| `status` | 현재 실행 중인 서비스 상태 확인 | `./manage-services.sh status` |
| `logs [service]` | 특정 서비스의 로그 보기 | `./manage-services.sh logs teacher-web` |
| `test` | 서비스 연결 테스트 | `./manage-services.sh test` |
| `help` | 도움말 표시 | `./manage-services.sh help` |

---

## 🌐 서비스 포트 및 URL

### 현재 실행 중인 서비스

| 서비스 | 포트 | URL | 상태 |
|--------|------|-----|------|
| **Signaling** | 8080 | ws://localhost:8080 | ✅ 실행 중 |
| **Admin Web** | 5173 | http://localhost:5173 | ✅ 실행 중 |
| **Teacher Web** | 5174 | http://localhost:5174 | ✅ 실행 중 |
| **Scheduling (API)** | 3000 | http://localhost:3000 | ⚠️ PostgreSQL 필요 |

---

## 📝 서비스 상세 정보

### 1. **Signaling Server** (WebSocket)
- **포트**: 8080
- **역할**: 실시간 통신 중계
- **기술**: Node.js + ws (WebSocket)
- **상태**: ✅ 실행 중
- **로그**: `.service-logs/signaling.log`

### 2. **Admin Web** (프론트엔드)
- **포트**: 5173
- **역할**: 관리자 대시보드
- **기술**: React + Vite
- **상태**: ✅ 실행 중
- **로그**: `.service-logs/admin-web.log`
- **접속**: http://localhost:5173

### 3. **Teacher Web** (프론트엔드)
- **포트**: 5174
- **역할**: 선생님 인터페이스
- **기술**: React + Vite
- **상태**: ✅ 실행 중
- **로그**: `.service-logs/teacher-web.log`
- **접속**: http://localhost:5174

### 4. **Scheduling Server** (백엔드 API)
- **포트**: 3000
- **역할**: 스케줄링 및 API 서비스
- **기술**: Fastify + Prisma + PostgreSQL
- **상태**: ⚠️ 설정 필요 (PostgreSQL)
- **로그**: `.service-logs/scheduling.log`
- **접속**: http://localhost:3000

---

## 🔧 트러블슈팅

### PostgreSQL 설정 (Scheduling 서버 실행)

Scheduling 서버는 PostgreSQL 데이터베이스가 필요합니다:

```bash
# 1. PostgreSQL 설치 (macOS)
brew install postgresql@15

# 2. PostgreSQL 시작
brew services start postgresql@15

# 3. 데이터베이스 생성
createdb studymeet -U postgres

# 4. 사용자 생성 (필요한 경우)
createuser studymeet -P
# 비밀번호: studymeet (또는 변경)

# 5. Scheduling 서버 수동 시작
cd scheduling
npm run dev
```

### 포트 충돌 해결

특정 포트가 이미 사용 중인 경우:

```bash
# 포트를 사용하는 프로세스 확인
lsof -i :8080

# 프로세스 종료
kill -9 <PID>

# 또는 포트 변경 (환경변수)
PORT=9090 npm run dev
```

### 로그 확인

```bash
# 특정 서비스 로그 실시간 보기
./manage-services.sh logs teacher-web

# 또는 직접 확인
tail -f .service-logs/teacher-web.log

# 모든 로그 파일 보기
ls -lh .service-logs/
```

### 서비스 강제 종료

정상 종료가 안 될 경우:

```bash
# 모든 서비스 프로세스 강제 종료
killall -9 node npm

# 그 후 다시 시작
./manage-services.sh start
```

---

## 🧪 테스트

### 서비스 연결 테스트

```bash
./manage-services.sh test
```

### 수동 테스트

```bash
# Signaling 서버 테스트
nc -w 1 localhost 8080

# Admin Web 테스트
curl http://localhost:5173

# Teacher Web 테스트
curl http://localhost:5174

# Scheduling API 테스트 (PostgreSQL 필요)
curl http://localhost:3000/health
```

---

## 📊 프로세스 상태 파일

서비스가 시작되면 `.service-pids` 파일에 프로세스 ID가 저장됩니다:

```bash
cat .service-pids
# 출력 예:
# signaling:24550
# admin-web:24586
# teacher-web:24624
```

---

## 🔄 일반적인 워크플로우

### 개발 중 서비스 관리

```bash
# 1. 초기 시작
./manage-services.sh setup
./manage-services.sh start

# 2. 코드 수정 후 서비스 재시작
./manage-services.sh restart

# 3. 특정 서비스의 로그 확인
./manage-services.sh logs teacher-web

# 4. 작업 완료 후 모든 서비스 중지
./manage-services.sh stop
```

### 디버깅

```bash
# 현재 상태 확인
./manage-services.sh status

# 특정 서비스 로그 확인
./manage-services.sh logs admin-web

# 전체 로그 파일 목록
ls -lh .service-logs/

# 실시간 로그 보기
tail -f .service-logs/admin-web.log
```

---

## 📁 프로젝트 구조

```
StudyMeet/
├── manage-services.sh           # 서비스 관리 스크립트
├── SERVICE_MANAGEMENT.md        # 이 문서
├── .service-logs/               # 서비스 로그 디렉토리
│   ├── signaling.log
│   ├── admin-web.log
│   ├── teacher-web.log
│   └── scheduling.log
├── .service-pids                # 실행 중인 프로세스 ID
│
├── signaling/                   # WebSocket 시그널링 서버
│   ├── server.js
│   ├── package.json
│   └── public/
│
├── admin-web/                   # 관리자 웹 인터페이스
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── teacher-web/                 # 선생님 웹 인터페이스
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
└── scheduling/                  # 스케줄링 API 서버
    ├── src/
    ├── prisma/
    ├── package.json
    └── .env (자동 생성)
```

---

## 📞 환경 변수

각 서비스의 환경 변수 설정:

### signaling/.env
```
PORT=8080
HOST=0.0.0.0
```

### scheduling/.env
```
DATABASE_URL=postgresql://studymeet:studymeet@localhost:5432/studymeet
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
OPERATOR_SECRET=dev-only-secret-change-in-production-12345678
HOST=127.0.0.1
```

---

## ⚠️ 주의사항

1. **PostgreSQL**: Scheduling 서버는 PostgreSQL이 필요합니다. 설치되어 있지 않으면 해당 서비스는 시작되지 않습니다.

2. **포트 사용**: 지정된 포트가 이미 사용 중이면 서비스가 시작되지 않습니다. 포트 충돌 확인 후 해결하세요.

3. **Node.js 버전**: Node.js v22.14.0 이상이 필요합니다.

4. **로그 파일**: 장시간 실행 시 로그 파일 크기가 커질 수 있습니다. 정기적으로 정리하세요.

---

## 🐛 문제 해결

**Q: "port already in use" 에러가 발생합니다**
A: 해당 포트를 사용하는 프로세스를 확인하고 종료하거나, 다른 포트를 사용하도록 설정하세요.

**Q: 서비스가 시작되었는데 접속이 안 됩니다**
A: 로그 파일을 확인하여 오류 메시지를 확인하세요.
```bash
./manage-services.sh logs <service-name>
```

**Q: PostgreSQL을 어떻게 설치하나요?**
A: macOS에서:
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Q: 모든 서비스를 한 번에 종료하려면?**
A: 
```bash
./manage-services.sh stop
```

---

## 📚 추가 정보

- 각 서비스의 README: `[서비스명]/README.md`
- Vite 개발 서버: https://vitejs.dev/
- Fastify: https://www.fastify.io/
- Prisma ORM: https://www.prisma.io/
