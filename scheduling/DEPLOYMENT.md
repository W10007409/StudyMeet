# StudyMeet Scheduling 백엔드 EKS 배포 가이드

이 문서는 StudyMeet 스케줄링 백엔드 서비스를 AWS EKS(Elastic Kubernetes Service)에 배포하는 방법을 설명합니다.

## 1. 서비스 개요

### 1.1 서비스 소개
StudyMeet Scheduling은 수업 스케줄 관리 및 실시간 통신을 담당하는 Node.js 백엔드 서비스입니다.

### 1.2 기술 스택
- **런타임**: Node.js 20 (Alpine Linux)
- **프레임워크**: Fastify 5.11.2
- **ORM**: Prisma 7.9.1
- **데이터베이스**: PostgreSQL 14+
- **실시간 통신**: WebSocket (Fastify WebSocket)
- **푸시 알림**: Firebase Admin SDK (FCM)
- **비디오 토큰**: LiveKit Server SDK 2.18.0

### 1.3 주요 기능
- 수업 생성, 수정, 삭제 및 조회 API
- Firebase Cloud Messaging (FCM) 푸시 알림 발송
- WebSocket 기반 실시간 시그널링
- LiveKit 영상 통화 토큰 발급
- 헬스체크 엔드포인트 (`GET /health`)

---

## 2. 사전 준비 (AWS 리소스)

배포 전 다음 AWS 리소스를 준비해야 합니다.

### 2.1 EKS 클러스터
- **상태**: 실행 중인 EKS 클러스터 필요
- **쿠버네티스 버전**: 1.26 이상 권장
- **워커 노드**: 최소 2개 노드 (가용성 보장)
- **설정 확인**: 
  ```bash
  kubectl cluster-info
  kubectl get nodes
  ```

### 2.2 ECR 레포지토리
- **레포지토리 이름**: `studymeet-scheduling`
- **리전**: `ap-northeast-2` (서울)
- **생성 방법**:
  ```bash
  aws ecr create-repository \
    --repository-name studymeet-scheduling \
    --region ap-northeast-2
  ```

### 2.3 RDS PostgreSQL 데이터베이스
- **엔진**: PostgreSQL 14 이상
- **인스턴스 타입**: `db.t3.small` 이상 권장
- **데이터베이스 이름**: `studymeet`
- **마스터 사용자**: `studymeet`
- **엔드포인트**: 메모해두기 (예: `studymeet-db.c9akciq32.ap-northeast-2.rds.amazonaws.com:5432`)

### 2.4 RDS 보안 그룹 설정
EKS 워커 노드가 RDS에 접근하려면 보안 그룹을 구성해야 합니다.

**RDS 보안 그룹 인바운드 규칙 추가**:
- **프로토콜**: TCP
- **포트**: 5432
- **소스**: EKS 워커 노드 보안 그룹 ID
  ```bash
  # EKS 워커 노드 보안 그룹 ID 확인
  aws ec2 describe-instances --filters "Name=tag:eks:nodegroup-name,Values=*" \
    --query 'Reservations[*].Instances[*].SecurityGroups[*].GroupId' \
    --region ap-northeast-2
  ```

### 2.5 (선택) Route 53 도메인
- 도메인 등록 (예: `scheduling.studymeet.com`)
- 로드밸런서 EXTERNAL-IP에 DNS A 레코드 추가

---

## 3. 환경변수 설정

서비스는 두 가지 방식의 설정을 사용합니다:
- **ConfigMap**: 공개 환경변수 (비민감 정보)
- **Secret**: 민감한 환경변수 (API 키, 데이터베이스 비밀번호)

### 3.1 ConfigMap (`k8s/configmap.yaml`)

| 환경변수 | 설명 | 기본값 |
|---------|------|--------|
| `PORT` | 서비스 포트 | `3000` |
| `HOST` | 바인드 호스트 주소 | `0.0.0.0` |
| `CORS_ORIGIN` | CORS 허용 오리진 | `*` |
| `LIVEKIT_URL` | LiveKit 서버 WebSocket URL | `wss://helpmanager-cgkgdjae.livekit.cloud` |

**수정 필요 항목**:
- `LIVEKIT_URL`: 프로덕션 LiveKit Cloud URL로 변경 필요 (현재 테스트 URL 사용)

### 3.2 Secret (`k8s/secret.yaml`)

| 환경변수 | 설명 | 값의 출처 | 형식 |
|---------|------|----------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 | RDS 엔드포인트 | `postgresql://[사용자]:[비밀번호]@[호스트]:[포트]/[데이터베이스]` |
| `OPERATOR_SECRET` | 운영자 API 인증 시크릿 | 임의 생성 | 32자 이상의 무작위 문자열 |
| `LIVEKIT_API_KEY` | LiveKit API 키 | LiveKit Cloud 대시보드 | 문자열 |
| `LIVEKIT_API_SECRET` | LiveKit API 시크릿 | LiveKit Cloud 대시보드 | 문자열 |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase 서비스 계정 키 | Firebase Console | JSON 문자열 (한 줄) |

#### 3.2.1 DATABASE_URL 구성

RDS 엔드포인트를 이용한 연결 문자열 예:
```
postgresql://studymeet:MySecurePassword123@studymeet-db.c9akciq32.ap-northeast-2.rds.amazonaws.com:5432/studymeet
```

**구성 요소**:
- `studymeet`: RDS 마스터 사용자명
- `MySecurePassword123`: RDS 마스터 비밀번호
- `studymeet-db.c9akciq32.ap-northeast-2.rds.amazonaws.com`: RDS 엔드포인트
- `5432`: PostgreSQL 기본 포트
- `studymeet`: 데이터베이스 이름

#### 3.2.2 OPERATOR_SECRET 생성

운영자 API 요청 인증에 사용하는 시크릿을 생성합니다:
```bash
openssl rand -base64 32
# 예: sF7kL9mQ2wX5pZ8yN3vH6jB4cE2aT9wM=
```

#### 3.2.3 LiveKit API 키/시크릿 얻기

1. [LiveKit Cloud 대시보드](https://cloud.livekit.cloud)에 로그인
2. 프로젝트 선택
3. **Keys** 또는 **API** 섹션에서 API Key와 Secret 확인
4. 값을 Secret 파일에 붙여넣기

#### 3.2.4 FCM 서비스 계정 키 얻기

1. [Firebase Console](https://console.firebase.google.com)에서 StudyMeet 프로젝트 선택
2. 설정 (톱니바퀴 아이콘) → **프로젝트 설정**
3. **서비스 계정** 탭
4. **새 비공개 키 생성** 클릭
5. 다운로드된 JSON 파일의 내용을 한 줄로 변환:
   ```bash
   # JSON 파일을 한 줄 문자열로 변환
   cat serviceAccountKey.json | jq -c .
   ```
6. 결과 문자열을 `FCM_SERVICE_ACCOUNT_JSON`에 붙여넣기

**주의**: JSON 파일 내용을 그대로 복사하면 안됩니다. 반드시 `jq -c`를 사용해 한 줄 JSON으로 변환하세요.

### 3.3 Secret 파일 수정 예시

`k8s/secret.yaml` 수정 전:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: scheduling-secrets
  namespace: studymeet
type: Opaque
stringData:
  DATABASE_URL: "postgresql://studymeet:CHANGE_ME@your-rds-endpoint:5432/studymeet"
  OPERATOR_SECRET: "CHANGE_ME_IN_PRODUCTION"
  LIVEKIT_API_KEY: "APILGwTtFgnnUkP"
  LIVEKIT_API_SECRET: "CHANGE_ME"
  FCM_SERVICE_ACCOUNT_JSON: "{}"
```

수정 후:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: scheduling-secrets
  namespace: studymeet
type: Opaque
stringData:
  DATABASE_URL: "postgresql://studymeet:MySecurePassword123@studymeet-db.c9akciq32.ap-northeast-2.rds.amazonaws.com:5432/studymeet"
  OPERATOR_SECRET: "sF7kL9mQ2wX5pZ8yN3vH6jB4cE2aT9wM"
  LIVEKIT_API_KEY: "APILGwTtFgnnUkPabc123XYZ"
  LIVEKIT_API_SECRET: "SecretKeyFromLiveKitCloud123"
  FCM_SERVICE_ACCOUNT_JSON: "{\"type\":\"service_account\",\"project_id\":\"studymeet-prod\",...}"
```

---

## 4. Docker 이미지 빌드 및 ECR 푸시

### 4.1 전제 조건
- Docker가 설치되고 실행 중
- AWS CLI가 설치되고 구성됨 (`aws configure`)
- AWS 자격증명에 ECR 푸시 권한 필요

### 4.2 ECR 로그인

ECR에 Docker 자격증명을 로그인합니다:

```bash
# 변수 설정
AWS_ACCOUNT_ID="123456789012"  # 본인의 AWS 계정 ID로 변경
AWS_REGION="ap-northeast-2"

# ECR 로그인
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

**성공 메시지**:
```
Login Succeeded
```

### 4.3 Docker 이미지 빌드

스케줄링 서비스 디렉토리에서 이미지를 빌드합니다:

```bash
cd /path/to/scheduling

docker build -t studymeet-scheduling:latest .
```

**빌드 과정**:
1. Node.js 20 Alpine 이미지 다운로드
2. 의존성 설치 (`npm ci`)
3. Prisma 클라이언트 생성
4. 프로덕션 이미지 생성 (불필요한 파일 제거)

**빌드 시간**: 약 2-3분

### 4.4 ECR 이미지 태그 지정

로컬 이미지에 ECR 레포지토리 경로를 태그로 지정합니다:

```bash
AWS_ACCOUNT_ID="123456789012"
AWS_REGION="ap-northeast-2"

docker tag studymeet-scheduling:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/studymeet-scheduling:latest
```

### 4.5 ECR에 푸시

이미지를 ECR에 푸시합니다:

```bash
AWS_ACCOUNT_ID="123456789012"
AWS_REGION="ap-northeast-2"

docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/studymeet-scheduling:latest
```

**성공 메시지**:
```
latest: digest: sha256:abc123... size: 1234
```

### 4.6 이미지 버전 관리 (권장)

프로덕션 배포 시 버전 태그 사용을 권장합니다:

```bash
# 버전 태그로 빌드 및 푸시
IMAGE_TAG="v1.0.0"

docker tag studymeet-scheduling:latest \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/studymeet-scheduling:${IMAGE_TAG}

docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/studymeet-scheduling:${IMAGE_TAG}

# deployment.yaml에서 image 필드 업데이트:
# image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/studymeet-scheduling:v1.0.0
```

---

## 5. EKS 배포

### 5.1 전제 조건
- `kubectl`이 설치되고 EKS 클러스터에 구성됨
- `k8s/` 디렉토리의 모든 YAML 파일이 준비됨
- Secret 파일이 실제 값으로 수정됨

### 5.2 쿠버네티스 연결 확인

EKS 클러스터에 정상적으로 연결되었는지 확인합니다:

```bash
kubectl cluster-info
kubectl get nodes
```

**예상 출력**:
```
NAME                                        STATUS   ROLES    AGE
ip-10-0-1-100.ap-northeast-2.compute.internal   Ready    <none>   5d
ip-10-0-2-100.ap-northeast-2.compute.internal   Ready    <none>   5d
```

### 5.3 Namespace 생성 (선택사항)

배포에 필요한 namespace를 생성합니다. `k8s/configmap.yaml`과 `k8s/secret.yaml`에서 `namespace: studymeet`을 지정했으므로 namespace가 필요합니다.

**namespace.yaml 파일 확인 또는 생성**:
```bash
# namespace.yaml 생성 (필요시)
cat > k8s/namespace.yaml << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: studymeet
EOF

# namespace 생성
kubectl apply -f k8s/namespace.yaml
```

### 5.4 ConfigMap 적용

```bash
kubectl apply -f k8s/configmap.yaml
```

**확인**:
```bash
kubectl get configmap -n studymeet
kubectl describe configmap scheduling-config -n studymeet
```

### 5.5 Secret 적용

**중요**: Secret 파일을 수정하기 전에 다시 한 번 확인하세요.

```bash
# 실제 값으로 수정했는지 확인
cat k8s/secret.yaml | grep -E "DATABASE_URL|OPERATOR_SECRET|FCM_SERVICE_ACCOUNT_JSON"

# 문제가 없으면 적용
kubectl apply -f k8s/secret.yaml
```

**확인**:
```bash
kubectl get secret -n studymeet
kubectl describe secret scheduling-secrets -n studymeet
```

### 5.6 Deployment 적용 (이미지 URL 수정 필요)

Deployment를 적용하기 전에 ECR 이미지 URL을 수정해야 합니다.

**k8s/deployment.yaml 수정**:
```bash
# <AWS_ACCOUNT_ID>를 본인의 계정 ID로 변경
sed -i 's/<AWS_ACCOUNT_ID>/123456789012/g' k8s/deployment.yaml

# 변경 확인
grep "image:" k8s/deployment.yaml
```

**Deployment 적용**:
```bash
kubectl apply -f k8s/deployment.yaml
```

**확인**:
```bash
kubectl get deployment -n studymeet
kubectl describe deployment studymeet-scheduling -n studymeet
```

### 5.7 Service 적용

LoadBalancer 서비스를 생성하여 외부에서 접근 가능하게 합니다:

```bash
kubectl apply -f k8s/service.yaml
```

**확인**:
```bash
kubectl get svc -n studymeet
kubectl describe svc studymeet-scheduling -n studymeet
```

### 5.8 Pod 상태 확인

```bash
# Pod 확인
kubectl get pods -n studymeet

# 예상 출력:
# NAME                                    READY   STATUS    RESTARTS   AGE
# studymeet-scheduling-5d4f7c8f9b-2x4k8   1/1     Running   0          30s
# studymeet-scheduling-5d4f7c8f9b-7k9m2   1/1     Running   0          30s

# Pod 로그 확인
kubectl logs -f deployment/studymeet-scheduling -n studymeet
```

---

## 6. 배포 확인

### 6.1 Pod 상태 확인

모든 Pod이 `Running` 상태인지 확인합니다:

```bash
kubectl get pods -n studymeet
```

**Pod이 CrashLoopBackOff 상태인 경우**:
```bash
# Pod 로그 확인
kubectl logs <POD_NAME> -n studymeet

# 최근 이벤트 확인
kubectl describe pod <POD_NAME> -n studymeet
```

### 6.2 Service 및 LoadBalancer 확인

```bash
kubectl get svc -n studymeet

# 예상 출력:
# NAME                      TYPE           CLUSTER-IP     EXTERNAL-IP                                                                   PORT(S)
# studymeet-scheduling      LoadBalancer   10.100.50.10   a1b2c3d4-e5f6g7h8i9j0k1l2m3n4o5p6.elb.ap-northeast-2.amazonaws.com   80:30001/TCP,3000:30002/TCP
```

**EXTERNAL-IP 확인**: `<ELB_ENDPOINT>.elb.ap-northeast-2.amazonaws.com`

### 6.3 헬스체크 엔드포인트 테스트

서비스가 정상 작동하는지 확인합니다:

```bash
EXTERNAL_IP="a1b2c3d4-e5f6g7h8i9j0k1l2m3n4o5p6.elb.ap-northeast-2.amazonaws.com"

curl http://${EXTERNAL_IP}/health
```

**성공 응답**:
```json
{"status":"ok"}
```

**실패 응답 (예)**:
```
curl: (7) Failed to connect to ... Connection refused
```

### 6.4 연결 재시도

로드밸런서 활성화에는 1-3분이 소요됩니다. 다음을 시도하세요:

```bash
# 상태 확인
kubectl describe svc studymeet-scheduling -n studymeet

# Pod 로그 확인
kubectl logs -n studymeet -l app=scheduling --tail=50

# 재시도
sleep 30
curl http://${EXTERNAL_IP}/health
```

---

## 7. 데이터베이스 마이그레이션

### 7.1 Prisma 마이그레이션

Prisma는 데이터베이스 스키마를 관리합니다. 배포 후 마이그레이션을 실행해야 할 수 있습니다.

### 7.2 마이그레이션 방법

#### 방법 1: Pod 내에서 직접 실행 (권장)

```bash
# Pod에 접속
kubectl exec -it deployment/studymeet-scheduling -n studymeet -- sh

# 마이그레이션 실행
npx prisma migrate deploy

# Pod에서 나가기
exit
```

#### 방법 2: Job으로 마이그레이션 실행

마이그레이션을 별도 Job으로 실행하면 더 안전합니다:

```bash
cat > k8s/migration-job.yaml << EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: studymeet-scheduling-migrate
  namespace: studymeet
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/studymeet-scheduling:latest
        command: ["npx", "prisma", "migrate", "deploy"]
        envFrom:
          - configMapRef:
              name: scheduling-config
          - secretRef:
              name: scheduling-secrets
      restartPolicy: Never
  backoffLimit: 3
EOF

# Job 실행
kubectl apply -f k8s/migration-job.yaml

# Job 상태 확인
kubectl get jobs -n studymeet
kubectl logs -n studymeet job/studymeet-scheduling-migrate
```

### 7.3 마이그레이션 확인

```bash
# Prisma Studio를 통한 데이터베이스 확인 (로컬)
npm run prisma studio

# 또는 psql을 통한 직접 확인
psql postgresql://studymeet:password@<RDS_ENDPOINT>:5432/studymeet -c "\dt"
```

---

## 8. 주의사항

### 8.1 Secret 관리

- **Secret 파일 보안**: `k8s/secret.yaml`에는 민감한 정보가 포함됩니다.
  - 버전 관리 시스템(Git)에 커밋하지 않기
  - `.gitignore`에 추가: `k8s/secret.yaml`
  - 팀원과는 별도의 안전한 채널로 공유

### 8.2 ECR 이미지 URL

Deployment 배포 전 반드시 수정:
```yaml
# k8s/deployment.yaml
image: <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-2.amazonaws.com/studymeet-scheduling:latest
```

**필수 변경**:
```
<AWS_ACCOUNT_ID> → 실제 AWS 계정 ID (예: 123456789012)
```

### 8.3 WebSocket 연결 설정

Service에서 **NLB (Network Load Balancer)**를 사용합니다:
```yaml
# k8s/service.yaml의 annotation
service.beta.kubernetes.io/aws-load-balancer-type: nlb
```

**이유**: ALB는 WebSocket 연결에 timeout 이슈가 있으므로 NLB 사용 필수

### 8.4 FCM_SERVICE_ACCOUNT_JSON 형식

FCM 서비스 계정 JSON은 반드시 **한 줄 문자열**이어야 합니다:

```bash
# 올바른 형식 (한 줄)
FCM_SERVICE_ACCOUNT_JSON: "{\"type\":\"service_account\",\"project_id\":\"studymeet\",...}"

# 잘못된 형식 (여러 줄)
FCM_SERVICE_ACCOUNT_JSON: "
{
  \"type\": \"service_account\",
  ...
}
"
```

**변환 방법**:
```bash
# 다운로드한 JSON을 한 줄로 변환
cat serviceAccountKey.json | jq -c . | sed 's/"/\\"/g'
```

### 8.5 리소스 제한

현재 리소스 요청/제한 설정:
```yaml
# k8s/deployment.yaml
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

**필요시 조정**:
- 메모리 부족: `memory` 값 증가 (512Mi → 1Gi)
- CPU 부족: `cpu` 값 증가 (500m → 1000m)

### 8.6 헬스체크 설정

Kubernetes는 `/health` 엔드포인트로 주기적으로 Pod 상태를 확인합니다:
```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
```

---

## 9. 트러블슈팅

### 9.1 Pod CrashLoopBackOff 상태

Pod이 계속 재시작되는 경우:

```bash
# 상세 정보 확인
kubectl describe pod <POD_NAME> -n studymeet

# 로그 확인
kubectl logs <POD_NAME> -n studymeet --previous  # 이전 로그
kubectl logs <POD_NAME> -n studymeet             # 현재 로그
```

**일반적인 원인과 해결**:

| 원인 | 증상 | 해결 방법 |
|------|------|---------|
| 환경변수 누락 | `Error: missing required env var` | Secret/ConfigMap 재적용 |
| DB 연결 실패 | `Error: connect ECONNREFUSED` | DATABASE_URL 확인, RDS 보안그룹 확인 |
| FCM 키 오류 | `Error: invalid service account` | FCM_SERVICE_ACCOUNT_JSON 형식 확인 |
| 메모리 부족 | `OOMKilled` | 리소스 제한 증가 |

### 9.2 WebSocket 연결 실패

클라이언트가 WebSocket을 연결할 수 없는 경우:

```bash
# 로드밸런서 확인
kubectl describe svc studymeet-scheduling -n studymeet

# 포트 확인 (3000 포트가 열려있는지)
kubectl get svc studymeet-scheduling -n studymeet

# 보안그룹 확인 (3000 포트 허용)
# AWS Console → EC2 → Security Groups → EKS 노드 보안그룹
# 인바운드 규칙에 포트 3000 TCP 확인
```

**해결 방법**:
1. Service 포트 확인: `port: 3000`
2. EKS 노드 보안그룹에 인바운드 규칙 추가:
   - 프로토콜: TCP
   - 포트: 3000
   - 소스: 0.0.0.0/0 (또는 특정 IP)
3. 클라이언트 재연결 테스트

### 9.3 데이터베이스 연결 실패

Pod 로그에서 DB 연결 오류:

```bash
# DATABASE_URL 형식 확인
kubectl get secret scheduling-secrets -n studymeet -o jsonpath='{.data.DATABASE_URL}' | base64 -d

# 예상 형식:
# postgresql://studymeet:password@host:5432/studymeet

# RDS 엔드포인트 확인
aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,Endpoint.Address]'

# RDS 보안그룹 확인
aws ec2 describe-security-groups --group-ids <RDS_SG_ID>
```

**RDS 보안그룹 규칙 추가**:
```bash
aws ec2 authorize-security-group-ingress \
  --group-id <RDS_SECURITY_GROUP_ID> \
  --protocol tcp \
  --port 5432 \
  --source-group <EKS_NODE_SECURITY_GROUP_ID>
```

### 9.4 LoadBalancer EXTERNAL-IP가 Pending인 경우

```bash
# 상태 확인
kubectl get svc studymeet-scheduling -n studymeet

# 상세 정보 확인
kubectl describe svc studymeet-scheduling -n studymeet

# AWS LoadBalancer 생성 확인
aws elbv2 describe-load-balancers --region ap-northeast-2
```

**원인 및 해결**:
- 로드밸런서 생성 중 (1-3분 대기)
- EKS 클러스터에 LoadBalancer 서비스 지원 안됨:
  ```bash
  # AWS Load Balancer Controller 설치 필요
  helm repo add eks https://aws.github.io/eks-charts
  helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
    -n kube-system \
    --set clusterName=<CLUSTER_NAME>
  ```

### 9.5 Pod 로그 조회 방법

```bash
# 현재 로그 확인
kubectl logs deployment/studymeet-scheduling -n studymeet

# 실시간 로그 추적
kubectl logs -f deployment/studymeet-scheduling -n studymeet

# 최근 50줄만 확인
kubectl logs deployment/studymeet-scheduling -n studymeet --tail=50

# 이전 Pod 로그 확인 (재시작된 경우)
kubectl logs deployment/studymeet-scheduling -n studymeet --previous

# 특정 Pod 로그
kubectl logs <POD_NAME> -n studymeet

# 모든 Pod 로그 조회
kubectl logs -n studymeet -l app=scheduling
```

---

## 10. 자동 배포 스크립트

### 10.1 `deploy.sh` 사용법

편의성을 위해 자동 배포 스크립트가 제공됩니다.

**스크립트 위치**: `k8s/deploy.sh`

### 10.2 스크립트 구성

```bash
#!/bin/bash
set -e

# 1. ECR 로그인
# 2. Docker 이미지 빌드
# 3. ECR에 태그 지정 및 푸시
# 4. 쿠버네티스 매니페스트 적용 (ConfigMap, Secret, Deployment, Service)
# 5. Deployment 롤링 재시작
# 6. 배포 완료 및 Pod 상태 확인
```

### 10.3 사용 방법

**Step 1: 스크립트 준비**

```bash
# 스크립트 권한 설정
chmod +x k8s/deploy.sh

# 스크립트의 설정 값 수정
# AWS_ACCOUNT_ID, AWS_REGION 등을 실제 값으로 변경
```

**k8s/deploy.sh 수정**:
```bash
# 현재 설정
AWS_ACCOUNT_ID="YOUR_AWS_ACCOUNT_ID"
AWS_REGION="ap-northeast-2"
ECR_REPO="studymeet-scheduling"

# 실제 값으로 변경
AWS_ACCOUNT_ID="123456789012"
AWS_REGION="ap-northeast-2"
ECR_REPO="studymeet-scheduling"
```

**Step 2: 배포 실행**

```bash
# 기본 배포 (latest 태그 사용)
./k8s/deploy.sh

# 버전 태그를 지정한 배포
./k8s/deploy.sh v1.0.0
```

### 10.4 스크립트 실행 과정

```
1. ECR 로그인
   ↓
2. Docker 이미지 빌드
   ↓
3. 이미지 태그 지정
   ↓
4. ECR에 이미지 푸시
   ↓
5. Kubernetes 매니페스트 적용
   ├── namespace
   ├── configmap
   ├── secret
   ├── deployment
   └── service
   ↓
6. Deployment 롤링 재시작
   ↓
7. 배포 완료 확인
```

### 10.5 스크립트 출력 예시

```
Logging in to ECR...
Login Succeeded

Building Docker image...
[+] Building 45.3s (12/12) FINISHED
...

Tagging image...
Pushing to ECR...
latest: digest: sha256:abc123...

Deploying to EKS...
namespace/studymeet configured
configmap/scheduling-config configured
secret/scheduling-secrets configured
deployment.apps/studymeet-scheduling configured
service/studymeet-scheduling configured

Rolling restart...
deployment.apps/studymeet-scheduling restarted

Deployment complete!
NAME                                    READY   STATUS    RESTARTS   AGE
studymeet-scheduling-5d4f7c8f9b-2x4k8   1/1     Running   0          10s
studymeet-scheduling-5d4f7c8f9b-7k9m2   1/1     Running   0          5s
```

### 10.6 스크립트 자동화 (CI/CD 통합)

GitHub Actions 등 CI/CD 파이프라인에서 자동 배포:

```yaml
name: Deploy to EKS

on:
  push:
    branches:
      - main
    paths:
      - 'scheduling/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2
      
      - name: Configure kubectl
        run: |
          aws eks update-kubeconfig --name <CLUSTER_NAME> --region ap-northeast-2
      
      - name: Deploy to EKS
        working-directory: ./scheduling
        run: |
          chmod +x k8s/deploy.sh
          AWS_ACCOUNT_ID=${{ secrets.AWS_ACCOUNT_ID }} ./k8s/deploy.sh
```

---

## 11. 배포 후 확인 체크리스트

배포 완료 후 다음 항목을 확인합니다:

- [ ] Pod이 `Running` 상태인가?
  ```bash
  kubectl get pods -n studymeet
  ```

- [ ] LoadBalancer EXTERNAL-IP가 할당되었는가?
  ```bash
  kubectl get svc studymeet-scheduling -n studymeet
  ```

- [ ] 헬스체크 엔드포인트가 응답하는가?
  ```bash
  curl http://<EXTERNAL-IP>/health
  ```

- [ ] Pod 로그에 오류가 없는가?
  ```bash
  kubectl logs deployment/studymeet-scheduling -n studymeet
  ```

- [ ] 데이터베이스에 연결되었는가?
  ```bash
  kubectl logs deployment/studymeet-scheduling -n studymeet | grep -i database
  ```

- [ ] 필요한 환경변수가 설정되었는가?
  ```bash
  kubectl exec deployment/studymeet-scheduling -n studymeet -- env | sort
  ```

---

## 12. 롤백 방법

문제 발생 시 이전 버전으로 롤백할 수 있습니다:

```bash
# 배포 히스토리 확인
kubectl rollout history deployment/studymeet-scheduling -n studymeet

# 이전 버전으로 롤백
kubectl rollout undo deployment/studymeet-scheduling -n studymeet

# 특정 리비전으로 롤백
kubectl rollout undo deployment/studymeet-scheduling -n studymeet --to-revision=2

# 롤백 상태 확인
kubectl rollout status deployment/studymeet-scheduling -n studymeet
```

---

## 13. 모니터링 및 로깅 (권장)

### 13.1 Pod 실시간 모니터링

```bash
# 실시간 로그 추적
kubectl logs -f deployment/studymeet-scheduling -n studymeet

# 리소스 사용량 확인
kubectl top pods -n studymeet

# Pod 이벤트 모니터링
kubectl describe pods -n studymeet
```

### 13.2 CloudWatch 로깅 (선택사항)

EKS는 CloudWatch와 통합하여 중앙집중식 로깅이 가능합니다:

```bash
# CloudWatch Logs 그룹 확인
aws logs describe-log-groups --region ap-northeast-2 | grep -i scheduling

# 로그 조회
aws logs tail /aws/eks/studymeet/scheduling --follow --region ap-northeast-2
```

---

## 14. 성능 최적화

### 14.1 리소스 요청/제한 조정

메모리 또는 CPU 부족 시 다음을 조정합니다:

```yaml
# k8s/deployment.yaml
resources:
  requests:
    cpu: 500m        # 변경
    memory: 512Mi     # 변경
  limits:
    cpu: 1000m       # 변경
    memory: 1Gi       # 변경
```

변경 후 배포:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl rollout status deployment/studymeet-scheduling -n studymeet
```

### 14.2 HPA (Horizontal Pod Autoscaling) 설정 (선택사항)

부하에 따라 자동으로 Pod 수를 조정:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: scheduling-hpa
  namespace: studymeet
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: studymeet-scheduling
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

적용:
```bash
kubectl apply -f k8s/hpa.yaml
kubectl get hpa -n studymeet
```

---

## 15. 추가 리소스

- [EKS 공식 문서](https://docs.aws.amazon.com/eks/)
- [kubectl 치트시트](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Kubernetes 트러블슈팅](https://kubernetes.io/docs/tasks/debug-application-cluster/)
- [Prisma 문서](https://www.prisma.io/docs/)
- [Fastify 문서](https://www.fastify.io/docs/latest/)

---

## 16. 문의 및 지원

배포 중 문제가 발생하면 다음을 확인하세요:

1. **환경변수**: Secret과 ConfigMap이 올바르게 적용되었는지 확인
2. **로그**: Pod 로그에서 오류 메시지 확인
3. **네트워크**: RDS 보안그룹 및 EKS 노드 보안그룹 확인
4. **리소스**: CPU/메모리 부족 여부 확인

더 자세한 정보는 프로젝트 팀에 문의하세요.

---

**마지막 수정**: 2024년
**버전**: 1.0
