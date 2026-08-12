import { parseApiConfig } from "@nettiauto/config";
import { createSqlClient } from "@nettiauto/db";
import { createLogger } from "@nettiauto/logging";
import { createApiApp } from "./api-app";

const RESPONSE_CACHE_REFRESH_SWEEP_MS = 30 * 1_000;

const config = parseApiConfig();
const logger = createLogger({ service: "api", env: config.APP_ENV });
const sql = createSqlClient(config.DATABASE_URL);
const app = createApiApp({ sql, config, logger });

void app.refreshDefaultResponses();
setInterval(() => {
  void app.refreshDefaultResponses();
}, RESPONSE_CACHE_REFRESH_SWEEP_MS);

export default {
  port: Number(process.env.PORT ?? 3001),
  idleTimeout: 60,
  fetch: app.fetch,
};
