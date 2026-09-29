import { afterEach, expect, it, vi } from "vitest";
import { createSqlClient } from "@nettiauto/db";

vi.mock("@nettiauto/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@nettiauto/db")>(),
  createSqlClient: vi.fn(),
}));
vi.mock("@nettiauto/logging", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.resetModules();
});

it("boots and remains idle without analytics queries while health checks still work", async () => {
  vi.useFakeTimers();
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgres://unused/test");
  vi.stubEnv("ADMIN_PASSWORD", "test-password");
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("CRAWLER_ENABLED", "false");
  vi.stubEnv("CRAWLER_PAUSED", "false");
  const sql = vi.fn().mockResolvedValue([{ databaseReady: true, migrationsReady: true }]);
  vi.mocked(createSqlClient).mockReturnValue(sql as unknown as ReturnType<typeof createSqlClient>);

  const { default: server } = await import("./index");
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(sql).not.toHaveBeenCalled();
  expect((await server.fetch(new Request("http://api.test/health"))).status).toBe(200);
  expect(sql).not.toHaveBeenCalled();
  expect((await server.fetch(new Request("http://api.test/ready"))).status).toBe(200);
  expect(sql).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(sql).toHaveBeenCalledTimes(1);
});
