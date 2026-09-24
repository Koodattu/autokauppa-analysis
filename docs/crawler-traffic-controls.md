# Public crawler traffic controls

GPTBot generated 17,953 of 17,973 public requests in the September 24, 2026
11:45–14:16 Helsinki log window. Its socket addresses matched OpenAI's published
ranges. All public responses were 200, while 4,490 internal API responses were
429. Server-rendered error pages concealed the upstream throttling from crawlers.

## Policy

- `robots.txt` disallows GPTBot everywhere. Other crawlers, including
  OAI-SearchBot, may fetch canonical public pages but are asked not to crawl
  query-string variants, research, comparison, admin or API paths.
- Next.js Proxy rejects identified GPTBot page requests with 403 before rendering.
  The API also rejects GPTBot directly, before rate limiting or database access.
  `robots.txt` remains readable. Static assets and Caddy-served archived images
  are not passed through the page limiter.
- Other recognized crawlers receive 403 for excluded paths/variants. Allowed
  page requests have a 20/minute per-address budget and a 60/minute total budget.
  Exhaustion returns an actual 429 with `Retry-After`, `Cache-Control: private,
  no-store` and a request ID, before SSR or API calls. GET and HEAD both count.
- The budgets live in the single web process's memory and reset on restart.
  The global budget also bounds the address map to at most 60 entries. If web
  replicas are added, a shared admission mechanism is required for a global limit.
- User-agent classification expresses crawl policy, not authentication. A client
  concealing its crawler identity still faces the existing API limit of 120 calls
  per minute per forwarded address. Caddy must remain the trusted public ingress,
  replacing untrusted incoming `X-Forwarded-For`; the API has no public host port.
- Normal browser navigation and user-initiated ChatGPT-User requests retain their
  current behavior. Next.js RSC parameters/headers are not stripped from browser
  requests. The existing site-wide `noindex, nofollow` metadata is unchanged;
  allowing a search crawler does not itself enable search indexing.

## Observability

Proxy generates a fresh request ID for each page request, overwriting any supplied
ID, and returns it in `X-Request-Id`. Uncached server API calls forward that ID and
the user agent. API logs include the ID, bounded user agent, status and retry hint.
Web logs record `crawler_request_rejected` and `ssr_api_failure` with status and
request ID; filter values, cookies and client IPs are not added to those logs.

The API wrapper retains upstream `Retry-After` and request ID in `ApiError`.
Existing human-facing fallback pages can still have a 200 status after rendering
starts. Their failures are now explicit in web logs; public access-log status
alone remains insufficient for measuring successful SSR. Crawler admission
rejections are genuine 403/429 responses, not fallback pages. The three shared
homepage cache entries never receive visitor headers or per-request cache keys.

## Release and verification

No schema, data, worker or shared Caddy changes are required. Hold
`/run/lock/koodattu-auto-deploy.lock` before pushing. Build and deploy only web and
API with the production compose override and `--no-deps`; retain previous images
for rollback. Record the application/deployments revision pair in Nettiauto's
existing auto-deployment state after verification, then release the owned lock.

Verify robots.txt for GPTBot and browsers; 403 for GPTBot pages and direct API;
allowed canonical OAI-SearchBot pages; 403 for its query variants; 429 plus
Retry-After after the allowed crawler page budget; unaffected browser and RSC
navigation; matching public/API request IDs; API/web readiness and unchanged
worker/database start times. Rate-limit probes should use the static methodology
page to avoid artificial database load. Check production logs for actual GPTBot
403s and residual API 429s. A short post-release interval is not a daily forecast.

Sources: [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots),
[HTTP 429](https://www.rfc-editor.org/rfc/rfc6585.html#section-4),
[Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
