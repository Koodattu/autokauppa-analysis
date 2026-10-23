# syntax=docker/dockerfile:1

FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS node-runtime

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS manifests
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
# Alpine 3.22 still ships Node 22.23.2; use the patched Node 22 binary.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN apk add --no-cache ca-certificates libatomic \
    && node --version | grep -qx 'v22.23.4'
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

RUN chmod -R a+rX /app \
    && mkdir -p /data/hero-images \
    && chown -R bun:bun /data/hero-images

WORKDIR /app/apps/worker
USER bun
CMD ["bun", "node_modules/graphile-worker/dist/cli.js", "-C", "graphile.config.mjs"]
