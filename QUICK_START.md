# StudyMeet 서비스 빠른 시작 가이드

## ⚡ 한눈에 보기

```bash
# 초기 설정 (첫 실행 시만)
./manage-services.sh setup

# 서비스 시작
./manage-services.sh start

# 상태 확인
./manage-services.sh status

# 서비스 중지
./manage-services.sh stop

# 서비스 재시작
./manage-services.sh restart
```

---

## 🌐 접속 주소

| 서비스 | URL | 상태 |
|--------|-----|------|
| Admin Web | http://localhost:5173 | ✅ |
| Teacher Web | http://localhost:5174 | ✅ |
| Signaling | ws://localhost:8080 | ✅ |
| Scheduling API | http://localhost:3000 | ⚠️ PostgreSQL 필요 |

---

## 📝 로그 확인

```bash
# Teacher Web 로그
./manage-services.sh logs teacher-web

# Admin Web 로그
./manage-services.sh logs admin-web

# Signaling 로그
./manage-services.sh logs signaling

# Scheduling 로그
./manage-services.sh logs scheduling
```

---

## 🆘 문제 해결

```bash
# 포트 충돌 확인 (포트 8080 예시)
lsof -i :8080

# 모든 Node 프로세스 종료
killall -9 node npm

# 다시 시작
./manage-services.sh start

# 전체 상태 재확인
./manage-services.sh status
```

---

## 📚 자세한 가이드

전체 설명서는 [SERVICE_MANAGEMENT.md](./SERVICE_MANAGEMENT.md)를 참고하세요.

---

## 💡 팁

- **실시간 로그 보기**: `tail -f .service-logs/teacher-web.log`
- **모든 로그 파일**: `.service-logs/` 디렉토리 확인
- **프로세스 ID**: `.service-pids` 파일 확인
- **서비스 재설정**: `./manage-services.sh setup` 다시 실행
