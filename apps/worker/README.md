# Worker

Graphile Worker adapters for crawl scheduling, ingestion, enrichment, and storage
maintenance. Jobs share the domain package and PostgreSQL schema with the API.

From the repository root:

```sh
bun --no-env-file --cwd apps/worker typecheck
bun --no-env-file --cwd apps/worker build
```

The root `test:integration` command exercises worker persistence and recovery
using a disposable database and source fixtures. See the
[local development guide](../../docs/local-development.md). A live worker is
unnecessary for the synthetic public preview.

For intentional local worker development, set a dedicated `DATABASE_URL`,
`CRAWLER_ENABLED=false`, `CRAWLER_PAUSED=true`,
`CRAWLER_DETAIL_ENABLED=false`, and `HERO_IMAGE_ARCHIVE_ENABLED=false`, then run
`bun --no-env-file --cwd apps/worker dev`. That command builds and starts Graphile
Worker; it is not a standalone `index.ts` script. Keep it separate from tests
that truncate shared tables.
