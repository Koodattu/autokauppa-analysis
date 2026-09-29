import { parseApiConfig } from "@nettiauto/config";
import { createSqlClient } from "@nettiauto/db";
import { createLogger } from "@nettiauto/logging";
import { createApiApp } from "./api-app";

const config = parseApiConfig();
const logger = createLogger({ service: "api", env: config.APP_ENV });
// End database work before the HTTP connection's 60-second idle timeout.
const sql = createSqlClient(config.DATABASE_URL, 10, 30_000);
const app = createApiApp({ sql, config, logger });

export default {
  port: Number(process.env.PORT ?? 3001),
  idleTimeout: 60,
  fetch: app.fetch,
};
