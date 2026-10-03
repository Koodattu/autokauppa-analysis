# Web

Next.js App Router frontend for public research, listing history, browser-local
saved views and car comparison, plus the private crawler dashboard.

Follow the root [local development guide](../../docs/local-development.md) first.
The default web port is 3000; `INTERNAL_API_BASE_URL` defaults to
`http://localhost:3001`. Browser API requests use the same-origin `/api` proxy.

From the repository root:

```sh
bun --no-env-file --cwd apps/web dev
bun --no-env-file --cwd apps/web typecheck
bun --no-env-file --cwd apps/web lint
bun --no-env-file --cwd apps/web build
```

Pass an explicit local API URL in the environment. Stop the dev server before
building because both use `.next`. Production uses the repository's standalone
Docker output; see the root README for the existing deployment setup.

Product and visual conventions live in [PRODUCT.md](PRODUCT.md) and
[DESIGN.md](DESIGN.md). Pages are in `src/app`; API access and URL/navigation
helpers are in `src/lib`.
