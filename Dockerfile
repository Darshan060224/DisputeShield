# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm@10.4.1

COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN npm install -g pnpm@10.4.1

COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
