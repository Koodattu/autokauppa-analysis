# syntax=docker/dockerfile:1

FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS node-runtime

FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS manifests
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
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN apk add --no-cache ca-certificates libatomic \
    && node --version | grep -qx 'v26.13.1'
RUN --mount=type=cache,id=bun-install-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production --filter '@nettiauto/worker' \
    && chmod -R a+rX /app

ENV NODE_ENV=production

COPY --chmod=a+rX --from=build /app/apps/worker/dist apps/worker/dist
COPY --chmod=a+rX apps/worker/graphile.config.mjs apps/worker/crontab apps/worker/
COPY --chmod=a+rX packages/config/src packages/config/src
COPY --chmod=a+rX packages/db/src packages/db/src
COPY --chmod=a+rX packages/domain/src packages/domain/src
COPY --chmod=a+rX packages/logging/src packages/logging/src
COPY --chmod=a+rX packages/schemas/src packages/schemas/src

RUN mkdir -p /data/hero-images \
    && chown -R bun:bun /data/hero-images

WORKDIR /app/apps/worker
USER bun
CMD ["bun", "node_modules/graphile-worker/dist/cli.js", "-C", "graphile.config.mjs"]
