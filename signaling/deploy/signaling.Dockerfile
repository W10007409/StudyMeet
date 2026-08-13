# 빌드 컨텍스트는 signaling/ 이다 (docker-compose.yml 의 context: ..).
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

CMD ["node", "server.js"]
