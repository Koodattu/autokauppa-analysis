import { afterEach, describe, expect, it, vi } from "vitest";
import { parseApiConfig, parseWorkerConfig } from "./index";

const baseApiEnv = {
  APP_ENV: "production",
  DATABASE_URL: "postgres://nettiauto:change-me@postgres:5432/nettiauto_analytics",
  CRAWLER_ENABLED: "false",
  CRAWLER_PAUSED: "false",
  CRAWLER_DELAY_MS: "2500",
  CRAWLER_MAX_PAGES_PER_RUN: "2",
  ADMIN_PASSWORD: "change-me",
  SESSION_SECRET: "short",
};

const baseWorkerEnv = {
  APP_ENV: "test",
  DATABASE_URL: "postgres://nettiauto:test@postgres:5432/nettiauto_analytics",
  CRAWLER_ENABLED: "false",
  CRAWLER_PAUSED: "false",
};

describe("API config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns but does not crash for weak production admin secrets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const config = parseApiConfig(baseApiEnv as NodeJS.ProcessEnv);

    expect(config.ADMIN_PASSWORD).toBe("change-me");
    expect(config.SESSION_SECRET).toBe("short");
    expect(config.CRAWLER_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("ADMIN_PASSWORD");
    expect(warn.mock.calls[1]?.[0]).toContain("SESSION_SECRET");
  });

  it("still rejects missing required admin secrets", () => {
    expect(() =>
      parseApiConfig({
        APP_ENV: "production",
        DATABASE_URL: "postgres://nettiauto:change-me@postgres:5432/nettiauto_analytics",
        CRAWLER_ENABLED: "false",
        CRAWLER_PAUSED: "false",
        CRAWLER_DELAY_MS: "2500",
        CRAWLER_MAX_PAGES_PER_RUN: "2",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});

describe("worker source transport config", () => {
  it("keeps the native fetch transport as the safe default", () => {
    const config = parseWorkerConfig(baseWorkerEnv as NodeJS.ProcessEnv);

    expect(config.NETTIAUTO_SOURCE_TRANSPORT).toBe("fetch");
    expect(config.FLARESOLVERR_URL).toBe("http://flaresolverr:8191/v1");
    expect(config.FLARESOLVERR_SESSION_ID).toBe("nettiauto-worker");
    expect(config.FLARESOLVERR_SESSION_TTL_MINUTES).toBe(30);
    expect(config.DETAIL_BACKFILL_TARGET_LIMIT).toBe(20);
  });

  it("accepts each explicit experimental transport", () => {
    for (const transport of ["fetch", "impit", "flaresolverr"] as const) {
      const config = parseWorkerConfig({
        ...baseWorkerEnv,
        NETTIAUTO_SOURCE_TRANSPORT: transport,
      } as NodeJS.ProcessEnv);

      expect(config.NETTIAUTO_SOURCE_TRANSPORT).toBe(transport);
    }
  });

  it("rejects unknown transports instead of silently falling back", () => {
    expect(() =>
      parseWorkerConfig({
        ...baseWorkerEnv,
        NETTIAUTO_SOURCE_TRANSPORT: "automatic",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("accepts zero as the explicit unlimited detail-backfill target limit", () => {
    const config = parseWorkerConfig({
      ...baseWorkerEnv,
      DETAIL_BACKFILL_TARGET_LIMIT: "0",
    } as NodeJS.ProcessEnv);

    expect(config.DETAIL_BACKFILL_TARGET_LIMIT).toBe(0);
  });
});
