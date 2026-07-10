# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9 AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=bun-install-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --filter '@nettiauto/web'

COPY tsconfig.json tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/schemas packages/schemas
COPY packages/ui packages/ui

WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=next-build-cache,target=/app/apps/web/.next/cache \
    bun run build

FROM node:24.4.1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
