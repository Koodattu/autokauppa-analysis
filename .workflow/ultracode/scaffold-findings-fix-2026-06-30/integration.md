# Integration

## Accepted
- Compile worker TypeScript tasks to `dist/tasks` and run Graphile Worker there.
- Require sensitive Compose variables instead of using placeholder defaults.
- Gate empty migrations behind `ALLOW_EMPTY_MIGRATIONS=true`.
- Add worker PostgreSQL healthcheck.
- Pin Bun, Node, and Caddy image tags to explicit versions.

## Rejected
- Adding TypeScript loader/ts-node for Graphile Worker: unnecessary dependency for scaffold.
- Adding real worker tasks or domain logic: out of scope.
- Starting Compose stack: not needed for scaffold fix verification.

## Conflicts
None.

## Decisions
PostgreSQL remains `postgres:18-alpine` because the docs require a pinned major version, and that image is already major-pinned.

## Final changes
Eight scaffold files changed plus this workflow run directory.

## Verification still needed
Docker image build and `docker compose up` smoke before treating container runtime as fully proven.

## Remaining risks
The worker dev script runs against compiled output; a richer development watcher can be added when real tasks are introduced.
