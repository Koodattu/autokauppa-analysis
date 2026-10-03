import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

const target = process.env.TEST_DATABASE_URL;
let validTarget = false;
try {
  const url = new URL(target ?? "");
  validTarget = ["postgres:", "postgresql:"].includes(url.protocol)
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && url.pathname === "/nettiauto_storage_fixture_test";
} catch {
  // Report the requirement without printing a potentially sensitive URL.
}
if (!validTarget) {
  throw new Error(
    "Set TEST_DATABASE_URL to a migrated disposable localhost database named "
    + "nettiauto_storage_fixture_test. Integration tests erase its data. "
    + "See docs/local-development.md.",
  );
}

export default mergeConfig(baseConfig, defineConfig({
  test: { include: ["**/*.integration.test.ts"] },
}));
