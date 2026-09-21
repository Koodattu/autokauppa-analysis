import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

export type SqlClient = postgres.Sql<Record<string, unknown>>;
export type TransactionSqlClient = postgres.TransactionSql<Record<string, unknown>>;
export type DbClient = ReturnType<typeof createDbClient>;

export function createSqlClient(databaseUrl: string, max = 10, statementTimeoutMs?: number): SqlClient {
  return postgres(databaseUrl, {
    max,
    prepare: false,
    ...(statementTimeoutMs === undefined ? {} : { connection: { statement_timeout: statementTimeoutMs } }),
  }) as SqlClient;
}

export function createDbClient(sql: SqlClient) {
  return drizzle(sql, { schema });
}

export async function closeSqlClient(sql: SqlClient) {
  await sql.end({ timeout: 5 });
}
