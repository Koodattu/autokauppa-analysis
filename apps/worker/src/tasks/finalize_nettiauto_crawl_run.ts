import { z } from "zod";
import type { Task } from "graphile-worker";
import { parseWorkerConfig } from "@nettiauto/config";
import { closeSqlClient, createSqlClient } from "@nettiauto/db";
import { completeCrawlRun } from "@nettiauto/domain";

const payloadSchema = z.object({
  crawlRunId: z.string().uuid(),
  status: z.enum(["completed", "partial", "failed"]),
  expectedPageCount: z.number().int().positive().nullable().default(null),
  sourceTotalAds: z.number().int().nonnegative().nullable().default(null),
  failureReason: z.string().nullable().default(null),
});

const task: Task = async (payload) => {
  const config = parseWorkerConfig();
  const payloadResult = payloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    throw new Error(`Invalid finalize_nettiauto_crawl_run payload: ${payloadResult.error.message}`);
  }

  const sql = createSqlClient(config.DATABASE_URL, 1);
  try {
    await completeCrawlRun(sql, {
      crawlRunId: payloadResult.data.crawlRunId,
      cause: payloadResult.data.status === "completed"
        ? { kind: "source_exhausted" }
        : {
            kind: "source_failure",
            reason: payloadResult.data.failureReason ?? `legacy_${payloadResult.data.status}`,
          },
    });
  } finally {
    await closeSqlClient(sql);
  }
};

export default task;
