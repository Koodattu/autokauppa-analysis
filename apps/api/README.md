# API

Bun + Hono service for public product queries and private crawler administration.
The default port is 3001. `/health` checks the process; `/ready` checks PostgreSQL.

Use the root [local development guide](../../docs/local-development.md) to create
a disposable database and supply `DATABASE_URL`, `ADMIN_PASSWORD`,
`SESSION_SECRET`, and disabled crawler settings before starting.

From the repository root:

```sh
bun --no-env-file --cwd apps/api dev
bun --no-env-file --cwd apps/api typecheck
bun --no-env-file --cwd apps/api build
```

Database integration coverage is included in the root `test:integration` command.
