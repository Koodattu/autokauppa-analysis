FROM oven/bun:1 AS deps
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
RUN bun install --frozen-lockfile

COPY . .

FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app ./

WORKDIR /app/apps/worker
CMD ["../../node_modules/.bin/graphile-worker", "--task-directory", "./src/tasks"]
