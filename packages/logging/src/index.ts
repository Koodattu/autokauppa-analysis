import pino from "pino";

export type ServiceName = "api" | "worker" | "web" | "script" | "test";

export interface LoggerOptions {
  service: ServiceName;
  env?: string;
}

export function createLogger(options: LoggerOptions) {
  return pino({
    base: {
      service: options.service,
      env: options.env ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    },
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "ADMIN_PASSWORD",
        "SESSION_SECRET",
        "DATABASE_URL",
        "password",
        "session",
        "cookie",
        "cookies",
        "headers.cookie",
        "request.headers.cookie",
        "*.ADMIN_PASSWORD",
        "*.SESSION_SECRET",
        "*.DATABASE_URL",
      ],
      censor: "[redacted]",
    },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
