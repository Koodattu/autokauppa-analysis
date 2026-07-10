# syntax=docker/dockerfile:1

FROM oven/bun:1.3.9 AS manifests
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

FROM manifests AS build
RUN --mount=type=cache,id=bun-install-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --filter '@nettiauto/worker'

COPY tsconfig.base.json ./
COPY apps/worker/src apps/worker/src
COPY apps/worker/tsconfig.json apps/worker/tsconfig.json
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logging/src packages/logging/src
COPY packages/schemas/src packages/schemas/src
RUN bun --cwd apps/worker build

FROM manifests AS runner
RUN --mount=type=cache,id=bun-install-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production --filter '@nettiauto/worker'

ENV NODE_ENV=production

COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY apps/worker/graphile.config.mjs apps/worker/crontab apps/worker/
COPY packages/config/src packages/config/src
COPY packages/db/src packages/db/src
COPY packages/domain/src packages/domain/src
COPY packages/logging/src packages/logging/src
COPY packages/schemas/src packages/schemas/src

WORKDIR /app/apps/worker
CMD ["bun", "node_modules/graphile-worker/dist/cli.js", "-C", "graphile.config.mjs"]
