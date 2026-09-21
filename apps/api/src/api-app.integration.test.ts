import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import type { AppLogger } from "@nettiauto/logging";
import { runMigrations } from "graphile-worker";
import { createApiApp } from "./api-app";
import { createDetailBackfillControl } from "./detail-backfill-control";

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
    await runMigrations({ connectionString: testDatabaseUrl });
    const [row] = await sql<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!row?.relationName) {
      throw new Error("Test database migrations have not been applied.");
    }
  });

  beforeEach(async () => {
    await sql`truncate table listings restart identity cascade`;
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

  it("cancels over-budget API SQL and leaves the connection reusable without changing other clients", async () => {
    const boundedSql = createSqlClient(testDatabaseUrl, 1, 50);
    try {
      const [settings] = await boundedSql`select current_setting('statement_timeout') as timeout`;
      expect(settings?.timeout).toBe("50ms");
      await expect(boundedSql`select pg_sleep(1)`).rejects.toMatchObject({ code: "57014" });
      const [result] = await boundedSql`select 1 as value`;
      expect(result?.value).toBe(1);
      const [unbounded] = await sql`select current_setting('statement_timeout') as timeout`;
      expect(unbounded?.timeout).toBe("0");
      const boundedApp = createApiApp({ sql: boundedSql, config, logger });
      await sql.begin(async (transaction) => {
        await transaction`lock table listings in access exclusive mode`;
        const response = await boundedApp.fetch(new Request("http://api.test/filters"));
        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("5");
        expect(await response.json()).toEqual({ error: "query_timeout" });
      });
      const recovered = await boundedApp.fetch(new Request("http://api.test/filters"));
      expect(recovered.status).toBe(200);
      expect(recovered.headers.get("X-Filter-Cache")).toBe("miss");
    } finally {
      await closeSqlClient(boundedSql);
    }
  });

  it("stores detail-backfill control payloads as JSON objects", async () => {
    await sql`
      delete from graphile_worker._private_jobs
      where key = 'nettiauto:control:detail-backfill-start'
    `;

    const receipt = await createDetailBackfillControl({
      sql,
      crawlerState: {
        enabled: true,
        paused: false,
        delayMs: config.CRAWLER_DELAY_MS,
        maxPagesPerRun: config.CRAWLER_MAX_PAGES_PER_RUN,
        detailEnabled: config.CRAWLER_DETAIL_ENABLED,
        detailMaxPerRun: config.CRAWLER_DETAIL_MAX_PER_RUN,
      },
      logger,
    }).start();

    try {
      const [job] = await sql<{ payload: unknown; payloadType: string }[]>`
        select payload, json_typeof(payload) as "payloadType"
        from graphile_worker._private_jobs
        where id = ${receipt.jobId}
      `;
      expect(job).toEqual({ payload: {}, payloadType: "object" });
    } finally {
      await sql`delete from graphile_worker._private_jobs where id = ${receipt.jobId}`;
    }
  });
});
