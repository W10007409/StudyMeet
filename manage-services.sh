#!/bin/bash

# StudyMeet 서비스 관리 스크립트
# 사용법: ./manage-services.sh [start|stop|restart|status|setup]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$PROJECT_ROOT/.service-logs"
PID_FILE="$PROJECT_ROOT/.service-pids"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 디렉토리 생성
mkdir -p "$LOGS_DIR"

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

echo_error() {
    echo -e "${RED}[✗]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# 의존성 설치
setup_dependencies() {
    echo_info "의존성 설치를 시작합니다..."

    local services=("signaling" "scheduling" "admin-web" "teacher-web" "child-web")

    for service in "${services[@]}"; do
        if [ ! -d "$PROJECT_ROOT/$service/node_modules" ]; then
            echo_info "$service 의존성 설치 중..."
            cd "$PROJECT_ROOT/$service"
            npm install
            echo_success "$service 의존성 설치 완료"
        else
            echo_info "$service 의존성이 이미 설치되어 있습니다"
        fi
    done

    cd "$PROJECT_ROOT"
}

# 환경 변수 파일 생성
setup_env_files() {
    echo_info "환경 설정 파일을 생성합니다..."

    # scheduling .env
    if [ ! -f "$PROJECT_ROOT/scheduling/.env" ]; then
        echo_warning "scheduling/.env가 없습니다. 기본 값으로 생성합니다"
        cat > "$PROJECT_ROOT/scheduling/.env" << 'EOF'
# 개발 환경용 설정 - 테스트용으로만 사용
DATABASE_URL=postgresql://studymeet:studymeet@localhost:5432/studymeet
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
OPERATOR_SECRET=dev-only-secret-change-in-production-12345678
HOST=127.0.0.1
EOF
        echo_success "scheduling/.env 생성 완료 (개발용 기본값)"
    fi

    # signaling .env
    if [ ! -f "$PROJECT_ROOT/signaling/.env" ]; then
        cat > "$PROJECT_ROOT/signaling/.env" << 'EOF'
PORT=8080
HOST=0.0.0.0
EOF
        echo_success "signaling/.env 생성 완료"
    fi
}

# 서비스 시작
start_service() {
    local service=$1
    local port=$2
    local command=$3
    local log_file="$LOGS_DIR/${service}.log"

    if is_running "$service"; then
        echo_warning "$service는 이미 실행 중입니다"
        return 0
    fi

    echo_info "$service를 시작합니다... (포트: $port)"

    cd "$PROJECT_ROOT/$service"
    eval "$command" >> "$log_file" 2>&1 &
    local pid=$!

    # PID 저장
    echo "$service:$pid" >> "$PID_FILE"

    # 서비스 시작 대기
    sleep 2

    if kill -0 $pid 2>/dev/null; then
        echo_success "$service 시작됨 (PID: $pid, 포트: $port)"
        echo "  로그: $log_file"
    else
        echo_error "$service 시작 실패"
        echo "  로그 확인: tail -f $log_file"
        return 1
    fi
}

# 모든 서비스 시작
start_all() {
    echo_info "================================"
    echo_info "모든 서비스를 시작합니다"
    echo_info "================================"

    > "$PID_FILE" # PID 파일 초기화

    setup_env_files

    # 1. Signaling 서버 (WebSocket) - 포트 3000
    start_service "signaling" "3000" "PORT=3000 npm start" || echo_warning "signaling 시작에 실패했습니다"

    # 2. Scheduling 서버 (API)
    # 주의: 이 서버는 PostgreSQL이 필요합니다
    echo_warning "scheduling 서버는 PostgreSQL 데이터베이스가 필요합니다"
    echo_warning "PostgreSQL이 설치되어 있지 않으면 이 단계는 건너뜁니다"
    if command -v psql &> /dev/null; then
        start_service "scheduling" "3000" "npm run dev" || echo_warning "scheduling 시작에 실패했습니다"
    else
        echo_warning "PostgreSQL이 설치되어 있지 않습니다"
        echo_warning "scheduling 서버는 시작되지 않습니다"
        echo_info "PostgreSQL 설치 후 다음 명령어로 수동 시작:"
        echo_info "  cd $PROJECT_ROOT/scheduling && npm run dev"
    fi

    # 3. Admin Web (Vite)
    start_service "admin-web" "5173" "npm run dev" || echo_warning "admin-web 시작에 실패했습니다"

    # 4. Teacher Web (Vite)
    start_service "teacher-web" "5174" "npm run dev" || echo_warning "teacher-web 시작에 실패했습니다"

    # 5. Child Web (Vite)
    start_service "child-web" "5175" "npm run dev" || echo_warning "child-web 시작에 실패했습니다"

    echo_info "================================"
    echo_success "서비스 시작 완료"
    echo_info "================================"
    echo ""
    echo "실행 중인 서비스:"
    echo "  • Signaling:     ws://localhost:8080"
    echo "  • Scheduling:    http://localhost:3000 (PostgreSQL 필요)"
    echo "  • Admin Web:     http://localhost:5173"
    echo "  • Teacher Web:   http://localhost:5174"
    echo "  • Child Web:     http://localhost:5175"
    echo ""
    echo "로그 파일 위치: $LOGS_DIR/"
    echo ""
    echo "실행 중인 프로세스 확인: ./manage-services.sh status"
    echo "모든 서비스 종료: ./manage-services.sh stop"
}

# 서비스 실행 여부 확인
is_running() {
    local service=$1
    if [ ! -f "$PID_FILE" ]; then
        return 1
    fi

    local pid=$(grep "^$service:" "$PID_FILE" | cut -d: -f2)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    fi
    return 1
}

# 모든 서비스 중지
stop_all() {
    echo_info "================================"
    echo_info "모든 서비스를 중지합니다"
    echo_info "================================"

    if [ ! -f "$PID_FILE" ]; then
        echo_warning "실행 중인 서비스가 없습니다"
        return 0
    fi

    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi
        local service=$(echo "$line" | cut -d: -f1)
        local pid=$(echo "$line" | cut -d: -f2)

        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo_info "$service (PID: $pid) 중지 중..."
            kill $pid 2>/dev/null || true
            sleep 1
            if ! kill -0 "$pid" 2>/dev/null; then
                echo_success "$service 중지됨"
            else
                echo_warning "$service 강제 종료 중..."
                kill -9 $pid 2>/dev/null || true
                echo_success "$service 강제 종료됨"
            fi
        fi
    done < "$PID_FILE"

    # 포트 3000 강제 중지 (signaling/scheduling이 남아있을 수 있음)
    echo_info "포트 3000에서 실행 중인 프로세스 강제 종료 중..."
    if lsof -i :3000 >/dev/null 2>&1; then
        lsof -i :3000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9 2>/dev/null || true
        echo_success "포트 3000 정리 완료"
    fi

    rm -f "$PID_FILE"
    echo_success "모든 서비스 중지 완료"
}

# 서비스 상태 확인
status_all() {
    echo_info "================================"
    echo_info "서비스 상태"
    echo_info "================================"

    if [ ! -f "$PID_FILE" ] || [ ! -s "$PID_FILE" ]; then
        echo_warning "실행 중인 서비스가 없습니다"
        return 0
    fi

    echo ""
    while IFS= read -r line; do
        if [ -z "$line" ]; then
            continue
        fi
        local service=$(echo "$line" | cut -d: -f1)
        local pid=$(echo "$line" | cut -d: -f2)

        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo_success "$service (PID: $pid) - 실행 중"
        else
            echo_error "$service (PID: $pid) - 중지됨"
        fi
    done < "$PID_FILE"

    echo ""
    echo "로그 파일:"
    ls -lh "$LOGS_DIR"/ 2>/dev/null || echo_warning "로그 파일이 없습니다"
}

# 모든 서비스 재시작
restart_all() {
    echo_info "================================"
    echo_info "모든 서비스를 재시작합니다"
    echo_info "================================"
    stop_all
    sleep 2
    start_all
}

# 로그 보기
show_logs() {
    local service=$1
    if [ -z "$service" ]; then
        echo "사용법: ./manage-services.sh logs [서비스명]"
        echo "서비스명: signaling, scheduling, admin-web, teacher-web"
        return 1
    fi

    local log_file="$LOGS_DIR/${service}.log"
    if [ -f "$log_file" ]; then
        echo_info "$service 로그 보기 (최근 50줄):"
        tail -50f "$log_file"
    else
        echo_error "로그 파일이 없습니다: $log_file"
        return 1
    fi
}

# 테스트 헬퍼
test_services() {
    echo_info "================================"
    echo_info "서비스 연결 테스트"
    echo_info "================================"
    echo ""

    # Signaling 테스트
    echo_info "Signaling 서버 테스트..."
    if timeout 2 bash -c "echo '' | nc -w 1 localhost 8080" 2>/dev/null; then
        echo_success "Signaling 서버 응답"
    else
        echo_warning "Signaling 서버 응답 없음"
    fi

    # Scheduling 테스트
    echo_info "Scheduling API 테스트..."
    if command -v curl &> /dev/null; then
        if curl -s http://localhost:3000/health 2>/dev/null | grep -q . 2>/dev/null; then
            echo_success "Scheduling API 응답"
        else
            echo_warning "Scheduling API 응답 없음 (PostgreSQL이 필요합니다)"
        fi
    fi

    echo ""
}

# 주 함수
main() {
    local command=${1:-help}

    case "$command" in
        start)
            start_all
            ;;
        stop)
            stop_all
            ;;
        restart)
            restart_all
            ;;
        status)
            status_all
            ;;
        setup)
            setup_dependencies
            setup_env_files
            ;;
        logs)
            show_logs "$2"
            ;;
        test)
            test_services
            ;;
        *)
            cat << EOF
StudyMeet 서비스 관리 스크립트

사용법: ./manage-services.sh [명령어]

명령어:
  setup       - 의존성 설치 및 환경설정 초기화
  start       - 모든 서비스 시작
  stop        - 모든 서비스 중지
  restart     - 모든 서비스 재시작
  status      - 서비스 상태 확인
  logs [srv]  - 서비스 로그 보기
  test        - 서비스 연결 테스트
  help        - 이 도움말 표시

예시:
  # 첫 실행 시 설정
  ./manage-services.sh setup
  ./manage-services.sh start

  # 상태 확인
  ./manage-services.sh status

  # 특정 서비스 로그 보기
  ./manage-services.sh logs teacher-web

  # 모든 서비스 중지
  ./manage-services.sh stop

서비스 포트:
  • Signaling:     ws://localhost:8080
  • Scheduling:    http://localhost:3000 (PostgreSQL 필요)
  • Admin Web:     http://localhost:5173
  • Teacher Web:   http://localhost:5174

로그 위치: .service-logs/
EOF
            ;;
    esac
}

main "$@"
