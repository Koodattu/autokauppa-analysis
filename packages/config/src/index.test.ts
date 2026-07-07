import { afterEach, describe, expect, it, vi } from "vitest";
import { parseApiConfig } from "./index";

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

describe("API config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns but does not crash for weak production admin secrets", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const config = parseApiConfig(baseApiEnv as NodeJS.ProcessEnv);

    expect(config.ADMIN_PASSWORD).toBe("change-me");
    expect(config.SESSION_SECRET).toBe("short");
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
