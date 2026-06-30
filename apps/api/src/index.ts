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

function wantsJson(acceptHeader: string | undefined) {
  return acceptHeader?.includes("application/json") ?? false;
}

export default {
  port: Number(process.env.PORT ?? 3001),
  fetch: app.fetch,
};
