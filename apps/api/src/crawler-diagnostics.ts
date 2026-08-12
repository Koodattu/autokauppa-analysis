import type { SqlClient } from "@nettiauto/db";
import {
  getAdminCrawlerDiagnostics,
  type AdminCrawlerDiagnosticsResponse,
} from "@nettiauto/domain";

export interface CrawlerDiagnostics {
  inspect(): Promise<AdminCrawlerDiagnosticsResponse>;
}

export function createCrawlerDiagnostics(sql: SqlClient): CrawlerDiagnostics {
  return {
    inspect() {
      return getAdminCrawlerDiagnostics(sql);
    },
  };
}
