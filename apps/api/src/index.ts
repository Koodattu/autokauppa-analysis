import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { parseApiConfig } from "@nettiauto/config";
import { createSqlClient } from "@nettiauto/db";
import {
  ADMIN_SESSION_COOKIE_NAME,
  issueAdminSessionCookieValue,
  verifyAdminPassword,
  verifyAdminSessionCookieValue,
  getAdminCrawlerDiagnostics,
  getAdminCrawlerStatus,
  getAnalyticsSnapshot,
  getAnalyticsTimeSeries,
  getFilterMetadata,
  getMarketOverview,
  getPublicListingDetail,
  searchListings,
  setSourceSearchQueriesPaused,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import {
  adminCrawlerRunRequestSchema,
  adminCrawlerControlRequestSchema,
  adminLoginRequestSchema,
  listingIdSchema,
  listingFiltersQuerySchema,
  listingSearchQuerySchema,
  type ListingFiltersQuery,
} from "@nettiauto/schemas";
import { ResponseCache } from "./analytics-cache";
import { FixedWindowRateLimiter } from "./rate-limit";

const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_CACHE_MAX_ENTRIES = 32;
const RESPONSE_CACHE_REFRESH_SWEEP_MS = 30 * 1000;

const config = parseApiConfig();
const logger = createLogger({ service: "api", env: config.APP_ENV });
const sql = createSqlClient(config.DATABASE_URL);
const filterMetadataCache = new ResponseCache({
  name: "filter-metadata",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: filterMetadataCacheKey,
  loader: (query) => getFilterMetadata(sql, query),
  logger,
});
const analyticsSnapshotCache = new ResponseCache({
  name: "analytics-snapshot",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: analyticsSnapshotCacheKey,
  loader: (query) => getAnalyticsSnapshot(sql, query),
  logger,
});
const analyticsTimeSeriesCache = new ResponseCache({
  name: "analytics-time-series",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: analyticsTimeSeriesCacheKey,
  loader: (query) => getAnalyticsTimeSeries(sql, query),
  logger,
});
const defaultAnalyticsFilters = listingFiltersQuerySchema.parse({});

const app = new Hono();
const publicQueryLimiter = new FixedWindowRateLimiter({ limit: 120, windowMs: 60_000 });
const loginLimiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
const adminMutationLimiter = new FixedWindowRateLimiter({ limit: 20, windowMs: 60_000 });

void prewarmDefaultResponses();
setInterval(() => {
  void prewarmDefaultResponses();
}, RESPONSE_CACHE_REFRESH_SWEEP_MS);

const adminOnly = createMiddleware(async (c, next) => {
  const session = verifyAdminSessionCookieValue(
    getCookie(c, ADMIN_SESSION_COOKIE_NAME),
    config.SESSION_SECRET,
  );
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
});

app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id")?.slice(0, 100) || randomUUID();
  const startedAt = performance.now();
  c.header("X-Request-Id", requestId);
  await next();
  logger.info(
    {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    },
    "API request completed",
  );
});

const publicQueryRateLimit = createRateLimitMiddleware(publicQueryLimiter, "public-query");
app.use("/filters", publicQueryRateLimit);
app.use("/analytics/*", publicQueryRateLimit);
app.use("/market/*", publicQueryRateLimit);
app.use("/listings", publicQueryRateLimit);
app.use("/listings/*", publicQueryRateLimit);
app.use("/admin/login", createRateLimitMiddleware(loginLimiter, "admin-login"));
app.use("/admin/crawler/run", createRateLimitMiddleware(adminMutationLimiter, "admin-mutation"));
app.use("/admin/crawler/control", createRateLimitMiddleware(adminMutationLimiter, "admin-mutation"));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  logger.error({ error }, "Unhandled API error");
  return c.json({ error: "internal_error" }, 500);
});

app.get("/health", (c) => {
  return c.json({
    service: "api",
    status: "ok",
  });
});

app.get("/ready", async (c) => {
  const [row] = await sql<{ databaseReady: boolean; migrationsReady: boolean }[]>`
    select
      true as "databaseReady",
      to_regclass('drizzle.__drizzle_migrations') is not null as "migrationsReady"
  `;
  if (!row?.databaseReady || !row.migrationsReady) {
    return c.json({ service: "api", status: "not_ready" }, 503);
  }
  return c.json({ service: "api", status: "ready" });
});

app.get("/filters", async (c) => {
  const result = listingFiltersQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  const cached = await filterMetadataCache.get(result.data);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Filter-Cache", cached.status);
  c.header("X-Filter-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json(cached.value);
});

app.get("/analytics/trends", async (c) => {
  const result = listingFiltersQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  const snapshot = await analyticsSnapshotCache.get(result.data);
  const timeSeries = await analyticsTimeSeriesCache.get(result.data);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", timeSeries.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(timeSeries.ageMs / 1000)));
  return c.json({
    ...snapshot.value,
    appliedFilters: result.data,
    charts: {
      marketOverTime: timeSeries.value.marketOverTime,
      ...snapshot.value.charts,
    },
  });
});

app.get("/analytics/time-series", async (c) => {
  const result = listingFiltersQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  const cached = await analyticsTimeSeriesCache.get(result.data);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", cached.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json({ ...cached.value, appliedFilters: result.data });
});

app.get("/analytics/snapshot", async (c) => {
  const result = listingFiltersQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  const cached = await analyticsSnapshotCache.get(result.data);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", cached.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json({ ...cached.value, appliedFilters: result.data });
});

app.get("/market/overview", async (c) => {
  const result = listingSearchQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  return c.json(await getMarketOverview(sql, result.data));
});

app.get("/listings", async (c) => {
  const result = listingSearchQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  return c.json(await searchListings(sql, result.data));
});

app.get("/listings/:listingId", async (c) => {
  const listingId = listingIdSchema.safeParse(c.req.param("listingId"));
  if (!listingId.success) {
    return c.json({ error: "not_found" }, 404);
  }

  const listing = await getPublicListingDetail(sql, listingId.data);
  if (!listing) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json(listing);
});

app.post("/admin/login", async (c) => {
  const contentType = c.req.header("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await c.req.json()
    : await c.req.parseBody();
  const result = adminLoginRequestSchema.safeParse(body);
  if (!result.success || !verifyAdminPassword(result.data.password, config.ADMIN_PASSWORD)) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  setCookie(c, ADMIN_SESSION_COOKIE_NAME, issueAdminSessionCookieValue(config.SESSION_SECRET), {
    httpOnly: true,
    secure: config.APP_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  if (wantsJson(c.req.header("accept"))) {
    return c.json({ ok: true });
  }

  return c.redirect("/admin/crawler", 303);
});

app.get("/admin/session", adminOnly, (c) => {
  return c.json({ authenticated: true, scope: "admin" });
});

app.post("/admin/logout", (c) => {
  setCookie(c, ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: config.APP_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });

  if (wantsJson(c.req.header("accept"))) {
    return c.json({ ok: true });
  }

  return c.redirect("/admin/login", 303);
});

app.get("/admin/crawler/status", adminOnly, async (c) => {
  return c.json(
    await getAdminCrawlerStatus(sql, {
      enabled: config.CRAWLER_ENABLED,
      paused: config.CRAWLER_PAUSED,
      delayMs: config.CRAWLER_DELAY_MS,
      maxPagesPerRun: config.CRAWLER_MAX_PAGES_PER_RUN,
      detailEnabled: config.CRAWLER_DETAIL_ENABLED,
      detailMaxPerRun: config.CRAWLER_DETAIL_MAX_PER_RUN,
    }),
  );
});

app.get("/admin/crawler/diagnostics", adminOnly, async (c) => {
  return c.json(await getAdminCrawlerDiagnostics(sql));
});

app.post("/admin/crawler/run", adminOnly, async (c) => {
  const body = await readOptionalJsonBody(c.req);
  if (body === invalidJsonBody) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = adminCrawlerRunRequestSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "invalid_request", issues: result.error.issues }, 400);
  }

  if (!config.CRAWLER_ENABLED) {
    return c.json({ error: "crawler_disabled" }, 409);
  }

  if (config.CRAWLER_PAUSED) {
    return c.json({ error: "crawler_paused" }, 409);
  }

  const [existsRow] = await sql<{ relationName: string | null }[]>`
    select to_regclass('graphile_worker.jobs')::text as "relationName"
  `;
  if (!existsRow?.relationName) {
    return c.json({ error: "worker_not_ready" }, 503);
  }

  const crawlKind = result.data.crawlKind;
  const payload = crawlKind === "all" ? { force: true } : { force: true, crawlKind };
  const jobKey = `nettiauto:schedule:manual:${crawlKind}`;
  const [job] = await sql<{ jobId: string; runAt: string }[]>`
    select
      id::text as "jobId",
      run_at::text as "runAt"
    from graphile_worker.add_job(
      identifier => 'schedule_nettiauto_crawl',
      payload => ${sql.json(payload)}::json,
      queue_name => 'nettiauto',
      run_at => null::timestamptz,
      max_attempts => 1,
      job_key => ${jobKey},
      priority => 0,
      flags => null::text[],
      job_key_mode => 'preserve_run_at'
    )
  `;

  logger.info({ jobId: job?.jobId, crawlKind }, "Manual Nettiauto crawl scheduled");
  return c.json({
    ok: true,
    task: "schedule_nettiauto_crawl",
    crawlKind,
    jobId: job?.jobId ?? null,
    runAt: job?.runAt ?? null,
  });
});

app.post("/admin/crawler/control", adminOnly, async (c) => {
  const body = await readOptionalJsonBody(c.req);
  if (body === invalidJsonBody) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = adminCrawlerControlRequestSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "invalid_request", issues: result.error.issues }, 400);
  }

  const pausedUntil = result.data.action === "pause"
    ? new Date(Date.now() + result.data.pauseMinutes * 60 * 1_000)
    : null;
  const affectedQueryCount = await setSourceSearchQueriesPaused(sql, {
    crawlKind: result.data.crawlKind,
    pausedUntil,
    reason: result.data.action === "pause" ? "admin_pause" : null,
  });
  logger.info(
    { action: result.data.action, crawlKind: result.data.crawlKind, affectedQueryCount },
    "Nettiauto crawler control updated",
  );
  return c.json({
    ok: true,
    action: result.data.action,
    crawlKind: result.data.crawlKind,
    affectedQueryCount,
    pausedUntil: pausedUntil?.toISOString() ?? null,
  });
});

const invalidJsonBody = Symbol("invalidJsonBody");

async function readOptionalJsonBody(req: {
  header(name: string): string | undefined;
  json(): Promise<unknown>;
}) {
  const contentType = req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return await req.json();
  } catch {
    return invalidJsonBody;
  }
}

function wantsJson(acceptHeader: string | undefined) {
  return acceptHeader?.includes("application/json") ?? false;
}

function createRateLimitMiddleware(limiter: FixedWindowRateLimiter, scope: string) {
  return createMiddleware(async (c, next) => {
    const clientAddress = c.req.header("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown";
    const result = limiter.check(`${scope}:${clientAddress}`);
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  });
}

async function prewarmDefaultResponses() {
  await filterMetadataCache.prewarm(defaultAnalyticsFilters);
  await analyticsSnapshotCache.prewarm(defaultAnalyticsFilters);
  await analyticsTimeSeriesCache.prewarm(defaultAnalyticsFilters);
}

function filterMetadataCacheKey(query: ListingFiltersQuery) {
  return JSON.stringify({
    make: query.make ?? null,
    model: query.model ?? null,
  });
}

function analyticsSnapshotCacheKey(query: ListingFiltersQuery) {
  return JSON.stringify({
    make: query.make ?? null,
    model: query.model ?? null,
    modelYear: query.modelYear ?? null,
    modelYearFrom: query.modelYearFrom ?? null,
    modelYearTo: query.modelYearTo ?? null,
    priceMin: query.priceMin ?? null,
    priceMax: query.priceMax ?? null,
    mileageMin: query.mileageMin ?? null,
    mileageMax: query.mileageMax ?? null,
    availability: query.availability,
    sellerType: query.sellerType ?? null,
    fuelType: query.fuelType ?? null,
    transmission: query.transmission ?? null,
  });
}

function analyticsTimeSeriesCacheKey(query: ListingFiltersQuery) {
  return JSON.stringify({
    snapshot: analyticsSnapshotCacheKey(query),
    from: query.from ?? null,
    to: query.to ?? null,
    interval: query.interval,
  });
}

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
};
