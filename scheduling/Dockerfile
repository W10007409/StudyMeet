# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production deps + tsx
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npm install tsx

# Generate Prisma client in production stage
RUN npx prisma generate

# Copy source files (needed for tsx)
COPY src ./src
COPY tsconfig.json ./

# Copy compiled Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
