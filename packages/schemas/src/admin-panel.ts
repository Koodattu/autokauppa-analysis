import { z } from "zod";

const crawlKindSchema = z.enum(["current", "sold"]);
const nullableString = z.string().nullable();

export const adminCrawlerStatusResponseSchema = z
  .object({
    crawlerState: z
      .object({
        enabled: z.boolean(),
        paused: z.boolean(),
        delayMs: z.number().int().nonnegative(),
        maxPagesPerRun: z.number().int().nonnegative(),
        detailEnabled: z.boolean(),
        detailMaxPerRun: z.number().int().nonnegative(),
      })
      .strict(),
    lastSuccessfulCrawls: z.array(
      z
        .object({
          crawlKind: crawlKindSchema,
          finishedAt: nullableString,
          parsedListingCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    recentRuns: z.array(
      z
        .object({
          id: z.string().uuid(),
          crawlKind: crawlKindSchema,
          status: z.string(),
          startedAt: nullableString,
          finishedAt: nullableString,
          fetchedPageCount: z.number().int().nonnegative(),
          parsedListingCount: z.number().int().nonnegative(),
          failureReason: nullableString,
        })
        .strict(),
    ),
    freshnessBySegment: z.array(
      z
        .object({
          crawlKind: crawlKindSchema,
          lastSuccessAt: nullableString,
          lastFailureAt: nullableString,
          enabled: z.boolean(),
          pausedUntil: nullableString,
          pauseReason: nullableString,
        })
        .strict(),
    ),
    queueBacklog: z
      .object({
        pendingJobs: z.number().int().nonnegative(),
        lockedJobs: z.number().int().nonnegative(),
        failedJobs: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const adminCrawlerDiagnosticsResponseSchema = z
  .object({
    failureCounts: z.array(
      z.object({ failureReason: z.string(), count: z.number().int().nonnegative() }).strict(),
    ),
    latestSourceFetchFailures: z.array(
      z
        .object({
          fetchedAt: z.string(),
          fetchKind: z.string(),
          pageNumber: z.number().int().nullable(),
          sourceUrl: z.string(),
          responseStatus: z.number().int().nullable(),
          responseBodyShape: z.string(),
          errorType: z.string(),
          errorMessage: nullableString,
        })
        .strict(),
    ),
    latestParserErrorSummaries: z.array(
      z
        .object({
          capturedAt: z.string(),
          parserVersion: z.string(),
          parseError: z.string(),
        })
        .strict(),
    ),
    latestFailedJobs: z.array(
      z
        .object({
          id: z.string(),
          taskIdentifier: z.string(),
          attempts: z.number().int().nonnegative(),
          maxAttempts: z.number().int().nonnegative(),
          runAt: nullableString,
          lastError: nullableString,
          createdAt: z.string(),
          updatedAt: nullableString,
        })
        .strict(),
    ),
    dataQuality: z
      .object({
        totalListings: z.number().int().nonnegative(),
        detailEnrichedListings: z.number().int().nonnegative(),
        rawRecordsLast30Days: z.number().int().nonnegative(),
        failedRawRecordsLast30Days: z.number().int().nonnegative(),
        fieldCoverage: z.array(
          z
            .object({
              field: z.string(),
              presentCount: z.number().int().nonnegative(),
              percentage: z.number().nonnegative(),
            })
            .strict(),
        ),
        parserVersions: z.array(
          z
            .object({
              parserVersion: z.string(),
              recordCount: z.number().int().nonnegative(),
              failedCount: z.number().int().nonnegative(),
              latestCapturedAt: z.string(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const adminCrawlerRunResponseSchema = z
  .object({
    ok: z.boolean(),
    task: z.literal("schedule_nettiauto_crawl"),
    crawlKind: z.enum(["all", "current", "sold"]),
    jobId: nullableString,
    runAt: nullableString,
  })
  .strict();

export const adminCrawlerControlResponseSchema = z
  .object({
    ok: z.boolean(),
    action: z.enum(["pause", "resume"]),
    crawlKind: z.enum(["all", "current", "sold"]),
    affectedQueryCount: z.number().int().nonnegative(),
    pausedUntil: nullableString,
  })
  .strict();
