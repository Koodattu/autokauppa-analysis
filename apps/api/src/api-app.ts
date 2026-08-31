import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ApiConfig } from "@nettiauto/config";
import type { SqlClient } from "@nettiauto/db";
import {
  ADMIN_SESSION_COOKIE_NAME,
  issueAdminSessionCookieValue,
  verifyAdminPassword,
  verifyAdminSessionCookieValue,
  getAnalyticsSnapshot,
  getAnalyticsTimeSeries,
  getFilterMetadata,
  getMarketOverview,
  getPublicListingDetail,
  searchListings,
} from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import {
  analysisQueryUrlFilter,
  adminCrawlerControlResponseSchema,
  adminCrawlerDiagnosticsResponseSchema,
  adminCrawlerRunResponseSchema,
  adminCrawlerStatusResponseSchema,
  adminCrawlerRunRequestSchema,
  adminCrawlerControlRequestSchema,
  adminDetailBackfillStartResponseSchema,
  adminDetailBackfillControlRequestSchema,
  adminDetailBackfillControlResponseSchema,
  adminDetailBackfillStatusResponseSchema,
  adminLoginRequestSchema,
  analyticsSnapshotResponseSchema,
  analyticsTimeSeriesResponseSchema,
  analyticsTrendResponseSchema,
  filterMetadataResponseSchema,
  listingIdSchema,
  listingFiltersQuerySchema,
  listingSearchResponseSchema,
  listingSearchUrlFilter,
  marketOverviewResponseSchema,
  publicListingDetailResponseSchema,
  type ListingFiltersQuery,
} from "@nettiauto/schemas";
import { ResponseCache } from "./analytics-cache";
import { createCrawlerDiagnostics } from "./crawler-diagnostics";
import {
  createDetailBackfillControl,
  DetailBackfillAlreadyActiveError,
  DetailBackfillNotActiveError,
} from "./detail-backfill-control";
import { createPostgresManualCrawlScheduler } from "./manual-crawl-scheduler";
import {
  CrawlerDisabledError,
  CrawlerPausedError,
  CrawlerSchedulerUnavailableError,
  createNettiautoCrawlerControl,
} from "./nettiauto-crawler-control";
import { FixedWindowRateLimiter } from "./rate-limit";

const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const RESPONSE_CACHE_MAX_ENTRIES = 32;

export interface ApiApp {
  fetch(request: Request): Response | Promise<Response>;
  refreshDefaultResponses(): Promise<void>;
}

export interface CreateApiAppInput {
  sql: SqlClient;
  config: Readonly<ApiConfig>;
  logger: AppLogger;
  now?: () => number;
}

export function createApiApp({
  sql,
  config,
  logger,
  now = Date.now,
}: CreateApiAppInput): ApiApp {
const filterMetadataCache = new ResponseCache({
  name: "filter-metadata",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: filterMetadataCacheKey,
  loader: (query) => getFilterMetadata(sql, query),
  logger,
  now,
});
const analyticsSnapshotCache = new ResponseCache({
  name: "analytics-snapshot",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: analyticsSnapshotCacheKey,
  loader: (query) => getAnalyticsSnapshot(sql, query),
  logger,
  now,
});
const analyticsTimeSeriesCache = new ResponseCache({
  name: "analytics-time-series",
  ttlMs: RESPONSE_CACHE_TTL_MS,
  maxEntries: RESPONSE_CACHE_MAX_ENTRIES,
  key: analyticsTimeSeriesCacheKey,
  loader: (query) => getAnalyticsTimeSeries(sql, query),
  logger,
  now,
});
const defaultAnalyticsFilters = listingFiltersQuerySchema.parse({});

const app = new Hono();
const publicQueryLimiter = new FixedWindowRateLimiter({ limit: 120, windowMs: 60_000 });
const loginLimiter = new FixedWindowRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
const adminMutationLimiter = new FixedWindowRateLimiter({ limit: 20, windowMs: 60_000 });
const crawlerState = {
  enabled: config.CRAWLER_ENABLED,
  paused: config.CRAWLER_PAUSED,
  delayMs: config.CRAWLER_DELAY_MS,
  maxPagesPerRun: config.CRAWLER_MAX_PAGES_PER_RUN,
  detailEnabled: config.CRAWLER_DETAIL_ENABLED,
  detailMaxPerRun: config.CRAWLER_DETAIL_MAX_PER_RUN,
};
const crawlerControl = createNettiautoCrawlerControl({
  sql,
  scheduler: createPostgresManualCrawlScheduler(sql),
  crawlerState,
  logger,
  now,
});
const crawlerDiagnostics = createCrawlerDiagnostics(sql);
const detailBackfillControl = createDetailBackfillControl({ sql, crawlerState, logger });

const adminOnly = createMiddleware(async (c, next) => {
  const session = verifyAdminSessionCookieValue(
    getCookie(c, ADMIN_SESSION_COOKIE_NAME),
    config.SESSION_SECRET,
    new Date(now()),
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

const publicQueryRateLimit = createRateLimitMiddleware(publicQueryLimiter, "public-query", now);
app.use("/filters", publicQueryRateLimit);
app.use("/analytics/*", publicQueryRateLimit);
app.use("/market/*", publicQueryRateLimit);
app.use("/listings", publicQueryRateLimit);
app.use("/listings/*", publicQueryRateLimit);
app.use("/admin/login", createRateLimitMiddleware(loginLimiter, "admin-login", now));
app.use("/admin/crawler/run", createRateLimitMiddleware(adminMutationLimiter, "admin-mutation", now));
app.use("/admin/crawler/control", createRateLimitMiddleware(adminMutationLimiter, "admin-mutation", now));
app.use("/admin/crawler/detail-backfill", createRateLimitMiddleware(adminMutationLimiter, "admin-mutation", now));
app.use(
  "/admin/crawler/detail-backfill/control",
  createRateLimitMiddleware(adminMutationLimiter, "admin-mutation", now),
);

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
  const result = analysisQueryUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  const cached = await filterMetadataCache.get(result.query);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Filter-Cache", cached.status);
  c.header("X-Filter-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json(filterMetadataResponseSchema.parse(cached.value));
});

app.get("/analytics/trends", async (c) => {
  const result = analysisQueryUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  const snapshot = await analyticsSnapshotCache.get(result.query);
  const timeSeries = await analyticsTimeSeriesCache.get(result.query);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", timeSeries.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(timeSeries.ageMs / 1000)));
  return c.json(
    analyticsTrendResponseSchema.parse({
      ...snapshot.value,
      appliedFilters: result.query,
      charts: {
        marketOverTime: timeSeries.value.marketOverTime,
        ...snapshot.value.charts,
      },
    }),
  );
});

app.get("/analytics/time-series", async (c) => {
  const result = analysisQueryUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  const cached = await analyticsTimeSeriesCache.get(result.query);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", cached.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json(
    analyticsTimeSeriesResponseSchema.parse({ ...cached.value, appliedFilters: result.query }),
  );
});

app.get("/analytics/snapshot", async (c) => {
  const result = analysisQueryUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  const cached = await analyticsSnapshotCache.get(result.query);
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  c.header("X-Analytics-Cache", cached.status);
  c.header("X-Analytics-Cache-Age", String(Math.floor(cached.ageMs / 1000)));
  return c.json(
    analyticsSnapshotResponseSchema.parse({ ...cached.value, appliedFilters: result.query }),
  );
});

app.get("/market/overview", async (c) => {
  const result = listingSearchUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  return c.json(marketOverviewResponseSchema.parse(await getMarketOverview(sql, result.query)));
});

app.get("/listings", async (c) => {
  const result = listingSearchUrlFilter.parse(new URL(c.req.url).searchParams);
  if (!result.ok) {
    return c.json({ error: "invalid_query", issues: result.issues }, 400);
  }

  return c.json(listingSearchResponseSchema.parse(await searchListings(sql, result.query)));
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

  return c.json(publicListingDetailResponseSchema.parse(listing));
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

  setCookie(c, ADMIN_SESSION_COOKIE_NAME, issueAdminSessionCookieValue(
    config.SESSION_SECRET,
    new Date(now()),
  ), {
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
  return c.json(adminCrawlerStatusResponseSchema.parse(await crawlerControl.observe()));
});

app.get("/admin/crawler/diagnostics", adminOnly, async (c) => {
  return c.json(adminCrawlerDiagnosticsResponseSchema.parse(await crawlerDiagnostics.inspect()));
});

app.get("/admin/crawler/detail-backfill", adminOnly, async (c) => {
  return c.json(
    adminDetailBackfillStatusResponseSchema.parse(await detailBackfillControl.observe()),
  );
});

app.post("/admin/crawler/detail-backfill", adminOnly, async (c) => {
  try {
    const receipt = await detailBackfillControl.start();
    return c.json(adminDetailBackfillStartResponseSchema.parse({ ok: true, ...receipt }));
  } catch (error) {
    if (error instanceof CrawlerDisabledError) {
      return c.json({ error: "crawler_disabled" }, 409);
    }
    if (error instanceof CrawlerPausedError) {
      return c.json({ error: "crawler_paused" }, 409);
    }
    if (error instanceof DetailBackfillAlreadyActiveError) {
      return c.json({ error: "detail_backfill_active" }, 409);
    }
    if (error instanceof CrawlerSchedulerUnavailableError) {
      return c.json({ error: "worker_not_ready" }, 503);
    }
    throw error;
  }
});

app.post("/admin/crawler/detail-backfill/control", adminOnly, async (c) => {
  const body = await readOptionalJsonBody(c.req);
  if (body === invalidJsonBody) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const result = adminDetailBackfillControlRequestSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "invalid_request", issues: result.error.issues }, 400);
  }

  try {
    const receipt = await detailBackfillControl.control(result.data.action);
    return c.json(adminDetailBackfillControlResponseSchema.parse({ ok: true, ...receipt }));
  } catch (error) {
    if (error instanceof CrawlerDisabledError) {
      return c.json({ error: "crawler_disabled" }, 409);
    }
    if (error instanceof CrawlerPausedError) {
      return c.json({ error: "crawler_paused" }, 409);
    }
    if (error instanceof DetailBackfillNotActiveError) {
      return c.json({ error: "detail_backfill_not_active" }, 409);
    }
    if (error instanceof CrawlerSchedulerUnavailableError) {
      return c.json({ error: "worker_not_ready" }, 503);
    }
    throw error;
  }
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

  const crawlKind = result.data.crawlKind;
  try {
    const receipt = await crawlerControl.apply({ kind: "schedule", crawlKind });
    if (receipt.kind !== "scheduled") {
      throw new Error("Unexpected Crawler Control receipt.");
    }
    return c.json(adminCrawlerRunResponseSchema.parse({
      ok: true,
      task: receipt.task,
      crawlKind: receipt.crawlKind,
      jobId: receipt.jobId,
      runAt: receipt.runAt,
    }));
  } catch (error) {
    if (error instanceof CrawlerDisabledError) {
      return c.json({ error: "crawler_disabled" }, 409);
    }
    if (error instanceof CrawlerPausedError) {
      return c.json({ error: "crawler_paused" }, 409);
    }
    if (error instanceof CrawlerSchedulerUnavailableError) {
      return c.json({ error: "worker_not_ready" }, 503);
    }
    throw error;
  }
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

  const receipt = await crawlerControl.apply(
    result.data.action === "pause"
      ? {
          kind: "pause",
          crawlKind: result.data.crawlKind,
          pauseMinutes: result.data.pauseMinutes,
        }
      : { kind: "resume", crawlKind: result.data.crawlKind },
  );
  if (receipt.kind !== "pause_updated") {
    throw new Error("Unexpected Crawler Control receipt.");
  }
  return c.json(adminCrawlerControlResponseSchema.parse({
    ok: true,
    action: receipt.action,
    crawlKind: receipt.crawlKind,
    affectedQueryCount: receipt.affectedQueryCount,
    pausedUntil: receipt.pausedUntil,
  }));
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

function createRateLimitMiddleware(
  limiter: FixedWindowRateLimiter,
  scope: string,
  now: () => number,
) {
  return createMiddleware(async (c, next) => {
    const clientAddress = c.req.header("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown";
    const result = limiter.check(`${scope}:${clientAddress}`, now());
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json({ error: "rate_limited" }, 429);
    }
    await next();
  });
}

async function refreshDefaultResponses() {
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

return {
  fetch: app.fetch,
  refreshDefaultResponses,
};
}
