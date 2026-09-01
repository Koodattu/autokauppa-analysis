import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import { createApiApp } from "./api-app";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = testDatabaseUrl ? describe : describe.skip;

describeDatabase("ApiApp PostgreSQL scenarios", () => {
  if (!testDatabaseUrl) {
    return;
  }

  const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error("Integration tests require a database name containing 'test'.");
  }

  const sql = createSqlClient(testDatabaseUrl, 1);
  const config: ApiConfig = {
    APP_ENV: "test",
    DATABASE_URL: testDatabaseUrl,
    SENTRY_DSN: "",
    CRAWLER_ENABLED: true,
    CRAWLER_PAUSED: false,
    CRAWLER_DELAY_MS: 2_500,
    CRAWLER_DELAY_JITTER_MS: 1_000,
    CRAWLER_REQUEST_TIMEOUT_MS: 30_000,
    CRAWLER_MAX_PAGES_PER_RUN: 2,
    CRAWLER_BLOCK_PAUSE_MS: 6 * 60 * 60 * 1_000,
    CRAWLER_DETAIL_ENABLED: false,
    CRAWLER_DETAIL_MAX_PER_RUN: 50,
    ADMIN_PASSWORD: "test-password",
    SESSION_SECRET: "test-session-secret",
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as AppLogger;
  const app = createApiApp({ sql, config, logger });

  beforeAll(async () => {
    const [row] = await sql<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!row?.relationName) {
      throw new Error("Test database migrations have not been applied.");
    }
  });

  afterAll(async () => {
    await closeSqlClient(sql);
  });

  it("serves readiness and a schema-validated empty filter response", async () => {
    const ready = await app.fetch(new Request("http://api.test/ready"));
    const filters = await app.fetch(new Request("http://api.test/filters"));

    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ service: "api", status: "ready" });
    expect(filters.status).toBe(200);
    expect(filters.headers.get("X-Filter-Cache")).toBe("miss");
    expect(await filters.json()).toMatchObject({
      makes: [],
      models: [],
      availability: ["all", "current", "sold"],
    });
  });
});
