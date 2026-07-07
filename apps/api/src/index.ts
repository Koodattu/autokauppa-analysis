import { Hono } from "hono";
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
  getAdminCrawlerStatus,
  getAnalyticsTrend,
  getFilterMetadata,
  getPublicListingDetail,
  searchListings,
} from "@nettiauto/domain";
import { createLogger } from "@nettiauto/logging";
import {
  adminCrawlerRunRequestSchema,
  adminLoginRequestSchema,
  listingFiltersQuerySchema,
  listingSearchQuerySchema,
} from "@nettiauto/schemas";

const config = parseApiConfig();
const logger = createLogger({ service: "api", env: config.APP_ENV });
const sql = createSqlClient(config.DATABASE_URL);

const app = new Hono();

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

app.get("/filters", async (c) => {
  return c.json(await getFilterMetadata(sql));
});

app.get("/analytics/trends", async (c) => {
  const result = listingFiltersQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  return c.json(await getAnalyticsTrend(sql, result.data));
});

app.get("/listings", async (c) => {
  const result = listingSearchQuerySchema.safeParse(c.req.query());
  if (!result.success) {
    return c.json({ error: "invalid_query", issues: result.error.issues }, 400);
  }

  return c.json(await searchListings(sql, result.data));
});

app.get("/listings/:listingId", async (c) => {
  const listing = await getPublicListingDetail(sql, c.req.param("listingId"));
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
    }),
  );
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

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
};
