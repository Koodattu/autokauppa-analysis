import { describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "@nettiauto/config";
import type { SqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import { createApiApp } from "./api-app";

const config: ApiConfig = {
  APP_ENV: "test",
  DATABASE_URL: "postgres://unused/test",
  SENTRY_DSN: "",
  CRAWLER_ENABLED: true,
  CRAWLER_PAUSED: false,
  CRAWLER_DELAY_MS: 2_500,
  CRAWLER_REQUEST_TIMEOUT_MS: 30_000,
  CRAWLER_MAX_PAGES_PER_RUN: 2,
  CRAWLER_BLOCK_PAUSE_MS: 6 * 60 * 60 * 1_000,
  CRAWLER_DETAIL_ENABLED: false,
  CRAWLER_DETAIL_MAX_PER_RUN: 50,
  ADMIN_PASSWORD: "test-password",
  SESSION_SECRET: "test-session-secret",
};

const sql = {} as SqlClient;
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as AppLogger;

describe("ApiApp HTTP interface", () => {
  it("serves process health without opening runtime resources", async () => {
    const app = createApiApp({ sql, config, logger });

    const response = await app.fetch(new Request("http://api.test/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok" });
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("validates Product API URL Filters through HTTP", async () => {
    const app = createApiApp({ sql, config, logger });

    const response = await app.fetch(
      new Request("http://api.test/analytics/snapshot?make=Ford&make=Volvo"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_query",
      issues: [{ code: "duplicate", path: ["make"], message: "make must be provided once." }],
    });
  });

  it("uses the injected clock for Admin Password Gate sessions", async () => {
    let now = Date.parse("2026-08-12T08:00:00Z");
    const app = createApiApp({ sql, config, logger, now: () => now });
    const login = await app.fetch(
      new Request("http://api.test/admin/login", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ password: config.ADMIN_PASSWORD }),
      }),
    );
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];

    expect(login.status).toBe(200);
    expect(cookie).toContain("nettiauto_admin=");

    const activeSession = await app.fetch(
      new Request("http://api.test/admin/session", { headers: { cookie: cookie ?? "" } }),
    );
    expect(activeSession.status).toBe(200);

    now += 7 * 24 * 60 * 60 * 1_000;
    const expiredSession = await app.fetch(
      new Request("http://api.test/admin/session", { headers: { cookie: cookie ?? "" } }),
    );
    expect(expiredSession.status).toBe(401);
  });
});
