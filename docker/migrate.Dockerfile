FROM oven/bun:1.3.9
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

COPY packages/db packages/db

WORKDIR /app/packages/db
CMD ["sh", "-c", "if [ -d drizzle/meta ]; then bun run migrate; elif [ \"$ALLOW_EMPTY_MIGRATIONS\" = \"true\" ]; then echo 'No Drizzle migrations generated yet; ALLOW_EMPTY_MIGRATIONS=true permits this scaffold-only no-op'; else echo 'No Drizzle migrations generated; set ALLOW_EMPTY_MIGRATIONS=true only for the empty scaffold' >&2; exit 1; fi"]
