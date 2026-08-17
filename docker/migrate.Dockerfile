# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0
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
    bun install --frozen-lockfile --filter './packages/db'

COPY packages/db/drizzle.config.ts packages/db/
COPY packages/db/drizzle packages/db/drizzle
COPY packages/db/src packages/db/src

RUN chmod -R a+rX /app

WORKDIR /app/packages/db
USER bun
CMD ["sh", "-c", "if [ -d drizzle/meta ]; then bun run migrate; elif [ \"$ALLOW_EMPTY_MIGRATIONS\" = \"true\" ]; then echo 'No Drizzle migrations generated yet; ALLOW_EMPTY_MIGRATIONS=true permits this scaffold-only no-op'; else echo 'No Drizzle migrations generated; set ALLOW_EMPTY_MIGRATIONS=true only for the empty scaffold' >&2; exit 1; fi"]
