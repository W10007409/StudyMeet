#!/bin/bash
set -e

# Configuration - CHANGE THESE
AWS_ACCOUNT_ID="YOUR_AWS_ACCOUNT_ID"
AWS_REGION="ap-northeast-2"
ECR_REPO="studymeet-scheduling"
IMAGE_TAG="${1:-latest}"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

echo "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URI}

echo "Building Docker image..."
docker build -t ${ECR_REPO}:${IMAGE_TAG} .

echo "Tagging image..."
docker tag ${ECR_REPO}:${IMAGE_TAG} ${ECR_URI}:${IMAGE_TAG}

echo "Pushing to ECR..."
docker push ${ECR_URI}:${IMAGE_TAG}

echo "Deploying to EKS..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

echo "Rolling restart..."
kubectl rollout restart deployment/studymeet-scheduling -n studymeet

echo "Deployment complete!"
kubectl get pods -n studymeet
