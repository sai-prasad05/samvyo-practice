# ── Dockerfile for Samvyo ─────────────────────────────────────
# ── Stage 1: deps ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: build ─────────────────────────────────────────────
# (In real Samvyo this compiles TypeScript. Here it's JS so build = copy)
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# If you had TypeScript: RUN npm run build
# For plain JS we just copy everything

# ── Stage 3: runtime ───────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN addgroup -S samvyo && adduser -S samvyo -G samvyo
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js    ./server.js
COPY --from=build /app/package.json ./package.json

USER samvyo
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]