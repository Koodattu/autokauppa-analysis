import { z } from "zod";

const appEnvSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const nettiautoSourceTransportSchema = z
  .enum(["fetch", "impit", "flaresolverr"])
  .default("fetch");

const booleanEnvSchema = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === undefined || value.trim() === "") {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }

    throw new Error(`Invalid boolean environment value: ${value}`);
  });

const integerEnvSchema = (defaultValue: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`Invalid non-negative integer environment value: ${value}`);
      }

      return parsed;
    });

const sharedConfigSchema = z.object({
  APP_ENV: appEnvSchema,
  DATABASE_URL: z.string().trim().min(1),
  SENTRY_DSN: z.string().optional().default(""),
  CRAWLER_ENABLED: booleanEnvSchema.transform((value) => value ?? false),
  CRAWLER_PAUSED: booleanEnvSchema.transform((value) => value ?? false),
  CRAWLER_DELAY_MS: integerEnvSchema(2_500),
  CRAWLER_DELAY_JITTER_MS: integerEnvSchema(1_000),
  CRAWLER_REQUEST_TIMEOUT_MS: integerEnvSchema(30_000),
  CRAWLER_MAX_PAGES_PER_RUN: integerEnvSchema(2),
  CRAWLER_BLOCK_PAUSE_MS: integerEnvSchema(6 * 60 * 60 * 1_000),
  CRAWLER_DETAIL_ENABLED: booleanEnvSchema.optional().transform((value) => value ?? false),
  CRAWLER_DETAIL_MAX_PER_RUN: integerEnvSchema(50),
});

const workerConfigSchema = sharedConfigSchema.extend({
  NETTIAUTO_SOURCE_TRANSPORT: nettiautoSourceTransportSchema,
  FLARESOLVERR_URL: z.string().url().default("http://flaresolverr:8191/v1"),
  FLARESOLVERR_SESSION_ID: z.string().trim().min(1).default("nettiauto-worker"),
  FLARESOLVERR_SESSION_TTL_MINUTES: integerEnvSchema(30),
  DETAIL_BACKFILL_BATCH_SIZE: integerEnvSchema(200),
  DETAIL_BACKFILL_TARGET_LIMIT: integerEnvSchema(5_000),
  HERO_IMAGE_ARCHIVE_ENABLED: booleanEnvSchema.optional().transform((value) => value ?? false),
  HERO_IMAGE_STORAGE_PATH: z.string().trim().min(1).default("/data/hero-images"),
  HERO_IMAGE_MAX_SOURCE_BYTES: integerEnvSchema(20 * 1024 * 1024),
});

const adminConfigSchema = z.object({
  ADMIN_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
});

const webConfigSchema = z.object({
  INTERNAL_API_BASE_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_API_BASE_PATH: z.string().default("/api"),
});

export type AppEnv = z.infer<typeof appEnvSchema>;
export type SharedServiceConfig = z.infer<typeof sharedConfigSchema>;
export type AdminConfig = z.infer<typeof adminConfigSchema>;
export type ApiConfig = SharedServiceConfig & AdminConfig;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
export type WebConfig = z.infer<typeof webConfigSchema>;

function warnWeakProductionSecret(
  name: "ADMIN_PASSWORD" | "SESSION_SECRET",
  value: string,
  appEnv: AppEnv,
) {
  if (appEnv !== "production") {
    return;
  }

  if (value === "change-me" || value.length < 32) {
    console.warn(
      `${name} should be a non-placeholder high-entropy secret in production. ` +
        "The service will start, but this should be fixed before exposing admin access.",
    );
  }
}

export function parseApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const shared = sharedConfigSchema.parse(env);
  const admin = adminConfigSchema.parse(env);
  warnWeakProductionSecret("ADMIN_PASSWORD", admin.ADMIN_PASSWORD, shared.APP_ENV);
  warnWeakProductionSecret("SESSION_SECRET", admin.SESSION_SECRET, shared.APP_ENV);

  return {
    ...shared,
    ...admin,
  };
}

export function parseWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerConfigSchema.parse(env);
}

export function parseWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  return webConfigSchema.parse(env);
}

export function safeConfigSnapshot(config: SharedServiceConfig) {
  return {
    appEnv: config.APP_ENV,
    crawlerEnabled: config.CRAWLER_ENABLED,
    crawlerPaused: config.CRAWLER_PAUSED,
    crawlerDelayMs: config.CRAWLER_DELAY_MS,
    crawlerDelayJitterMs: config.CRAWLER_DELAY_JITTER_MS,
    crawlerRequestTimeoutMs: config.CRAWLER_REQUEST_TIMEOUT_MS,
    crawlerMaxPagesPerRun: config.CRAWLER_MAX_PAGES_PER_RUN,
    crawlerBlockPauseMs: config.CRAWLER_BLOCK_PAUSE_MS,
    crawlerDetailEnabled: config.CRAWLER_DETAIL_ENABLED,
    crawlerDetailMaxPerRun: config.CRAWLER_DETAIL_MAX_PER_RUN,
    sentryConfigured: config.SENTRY_DSN.length > 0,
  };
}
