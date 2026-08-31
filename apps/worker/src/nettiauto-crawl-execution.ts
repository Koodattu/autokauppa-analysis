import type { WorkerConfig } from "@nettiauto/config";
import type { SqlClient } from "@nettiauto/db";
import {
  NETTIAUTO_DETAIL_PARSER_VERSION,
  buildNettiautoSearchUrl,
  completeCrawlRun,
  createCrawlRunForSourceQuery,
  emptyNettiautoSearchResultPage,
  getSchedulableSourceSearchQueries,
  hasUsableNettiautoDetailEvidence,
  nettiautoAjaxRequestHeaders,
  nettiautoDetailRequestHeaders,
  parseNettiautoAjaxSearchResult,
  parseNettiautoDetailPage,
  pauseSourceSearchQuery,
  persistNettiautoDetailPage,
  persistSearchResultPage,
  recoverStaleCrawlRuns,
  reserveCrawlRunDetailJobs,
  seedDefaultSourceSearchQueries,
} from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import type { CrawlWorkQueue } from "./crawl-work-queue";
import type { ListingHeroImageArchiver } from "./hero-image-archiver";
import {
  NETTIAUTO_DETAIL_PRIORITY_OFFSET,
  RetryableNettiautoFetchError,
  isRetryableNettiautoHttpStatus,
  shouldPauseNettiautoSource,
} from "./nettiauto-fetch-policy";
import {
  NettiautoSourceError,
  type NettiautoSource,
  type NettiautoSourceResponse,
} from "./nettiauto-source";

export interface CrawlJobContext {
  jobId: string;
  attemptNumber: number;
  maxAttempts: number;
  abortSignal: AbortSignal;
}

export interface NettiautoCrawlExecution {
  schedule(
    input: { force: boolean; crawlKind?: "current" | "sold" },
    context: CrawlJobContext,
  ): Promise<{ kind: "skipped" | "scheduled"; scheduledQueryCount: number }>;
  collectSearchResultPage(
    input: { crawlRunId: string; sourceQueryId: string; pageNumber: number },
    context: CrawlJobContext,
  ): Promise<{ kind: "skipped" | "stopped" | "continued" | "completed" }>;
  enrichDetailPage(
    input: {
      crawlRunId: string | null;
      detailBackfillRunId?: string | null;
      searchQueryId: string;
      sourceListingId: string;
      sourceUrl: string;
      force: boolean;
    },
    context: CrawlJobContext,
  ): Promise<DetailPageOutcome>;
}

export type DetailPageOutcome =
  | { kind: "skipped"; reason: "already_current" | "crawler_unavailable" | "source_unavailable" }
  | { kind: "stopped"; failureReason: string; blockedUntil: string | null }
  | {
      kind: "persisted";
      outcome: "parsed" | "unavailable" | "failed";
      failureReason: string | null;
      responseStatus: number;
    };

export function createNettiautoCrawlExecution(input: {
  sql: SqlClient;
  config: Readonly<WorkerConfig>;
  logger: AppLogger;
  source: NettiautoSource;
  workQueue: CrawlWorkQueue;
  heroImageArchiver?: ListingHeroImageArchiver;
  now?: () => number;
}): NettiautoCrawlExecution {
  const now = input.now ?? Date.now;

  return {
    async schedule(command, context) {
      if (!input.config.CRAWLER_ENABLED || input.config.CRAWLER_PAUSED) {
        input.logger.info(
          {
            jobId: context.jobId,
            task: "schedule_nettiauto_crawl",
            force: command.force,
            crawlKind: command.crawlKind ?? "all",
            crawlerEnabled: input.config.CRAWLER_ENABLED,
            crawlerPaused: input.config.CRAWLER_PAUSED,
          },
          "Nettiauto crawl scheduling skipped",
        );
        return { kind: "skipped", scheduledQueryCount: 0 };
      }

      await seedDefaultSourceSearchQueries(input.sql);
      const recoveredRuns = await recoverStaleCrawlRuns(input.sql);
      const queries = await getSchedulableSourceSearchQueries(input.sql, command);
      let scheduledQueryCount = 0;
      for (const query of queries) {
        const crawlRunId = await createCrawlRunForSourceQuery(input.sql, query.id);
        if (!crawlRunId) {
          continue;
        }
        try {
          await input.workQueue.enqueueSearchResultPage({
            crawlRunId,
            sourceQueryId: query.id,
            pageNumber: 1,
            priority: query.priority,
          });
          scheduledQueryCount += 1;
        } catch (error) {
          await completeCrawlRun(input.sql, {
            crawlRunId,
            cause: {
              kind: "source_failure",
              reason: error instanceof Error ? error.message : "failed_to_schedule_first_page",
            },
          });
          throw error;
        }
      }

      input.logger.info(
        {
          jobId: context.jobId,
          task: "schedule_nettiauto_crawl",
          force: command.force,
          crawlKind: command.crawlKind ?? "all",
          scheduledQueryCount,
          recoveredStaleRunCount: recoveredRuns.length,
        },
        "Nettiauto crawl jobs scheduled",
      );
      return { kind: "scheduled", scheduledQueryCount };
    },

    async collectSearchResultPage(command, context) {
      if (!input.config.CRAWLER_ENABLED || input.config.CRAWLER_PAUSED) {
        await completeCrawlRun(input.sql, {
          crawlRunId: command.crawlRunId,
          cause: {
            kind: "operator_stop",
            reason: input.config.CRAWLER_ENABLED ? "crawler_paused" : "crawler_disabled",
          },
        });
        input.logger.info(
          {
            jobId: context.jobId,
            task: "crawl_nettiauto_search_page",
            crawlRunId: command.crawlRunId,
            sourceQueryId: command.sourceQueryId,
            page: command.pageNumber,
            crawlerEnabled: input.config.CRAWLER_ENABLED,
            crawlerPaused: input.config.CRAWLER_PAUSED,
          },
          "Nettiauto search page crawl stopped",
        );
        return { kind: "stopped" };
      }

      try {
        const [sourceQuery] = await input.sql<
          {
            id: string;
            crawlKind: "current" | "sold";
            vehicleCategory: "passenger_car";
            entryPath: string;
            priority: number;
            enabled: boolean;
            crawlRunStatus: "planned" | "running" | "completed" | "partial" | "failed" | "cancelled";
            sourceSearchHash: string;
            queryParams: Record<string, unknown>;
            pausedUntil: string | null;
            pauseReason: string | null;
          }[]
        >`
          select
            source_query.id,
            source_query.crawl_kind as "crawlKind",
            source_query.vehicle_category as "vehicleCategory",
            source_query.entry_path as "entryPath",
            source_query.priority,
            source_query.enabled,
            run.status as "crawlRunStatus",
            source_query.source_search_hash as "sourceSearchHash",
            source_query.query_params as "queryParams",
            source_query.paused_until::text as "pausedUntil",
            source_query.pause_reason as "pauseReason"
          from crawl_runs run
          join source_search_queries source_query on source_query.id = run.search_query_id
          where run.id = ${command.crawlRunId}
            and run.search_query_id = ${command.sourceQueryId}
            and source_query.source = 'nettiauto'
          limit 1
        `;

        if (!sourceQuery) {
          throw new Error(`Nettiauto crawl context not found: ${command.crawlRunId}`);
        }

        if (sourceQuery.crawlRunStatus !== "running") {
          input.logger.info(
            {
              jobId: context.jobId,
              task: "crawl_nettiauto_search_page",
              crawlRunId: command.crawlRunId,
              crawlRunStatus: sourceQuery.crawlRunStatus,
              page: command.pageNumber,
            },
            "Nettiauto search page skipped for terminal crawl run",
          );
          return { kind: "skipped" };
        }

        if (!sourceQuery.enabled) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: {
              kind: "operator_stop",
              reason: `Nettiauto source query disabled: ${command.sourceQueryId}`,
            },
          });
          return { kind: "stopped" };
        }

        if (sourceQuery.pausedUntil && new Date(sourceQuery.pausedUntil).getTime() > now()) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: {
              kind: "operator_stop",
              reason: sourceQuery.pauseReason ?? "source_query_paused",
            },
          });
          return { kind: "stopped" };
        }

        const crawlAllPages = input.config.CRAWLER_MAX_PAGES_PER_RUN === 0;
        const maxPages = crawlAllPages
          ? Number.POSITIVE_INFINITY
          : Math.max(1, input.config.CRAWLER_MAX_PAGES_PER_RUN);
        const pageUrl = buildNettiautoSearchUrl(
          sourceQuery.entryPath,
          sourceQuery.sourceSearchHash,
          command.pageNumber,
          sourceQuery.queryParams,
        );
        const requestHeaders = nettiautoAjaxRequestHeaders(
          sourceQuery.entryPath,
          sourceQuery.sourceSearchHash,
          sourceQuery.queryParams,
        );
        let response: NettiautoSourceResponse;
        try {
          response = await input.source.fetchSearchResultPage({
            sourceUrl: pageUrl,
            requestHeaders,
            parentSignal: context.abortSignal,
            timeoutMs: input.config.CRAWLER_REQUEST_TIMEOUT_MS,
          });
        } catch (error) {
          const failureReason = error instanceof NettiautoSourceError
            ? error.failureReason
            : "network_error";
          const durationMs = error instanceof NettiautoSourceError ? error.durationMs : null;
          await persistSearchResultPage(input.sql, {
            crawlRunId: command.crawlRunId,
            searchQueryId: sourceQuery.id,
            crawlKind: sourceQuery.crawlKind,
            vehicleCategory: sourceQuery.vehicleCategory,
            sourceUrl: pageUrl,
            pageNumber: command.pageNumber,
            attemptNumber: context.attemptNumber,
            responseStatus: null,
            responseContentType: null,
            responseBodyShape: "unknown",
            responseBodySha256: null,
            responseBytes: null,
            durationMs,
            requestHeaders,
            errorType: failureReason,
            errorMessage: `Nettiauto search request ended before a response (${failureReason}).`,
            parsedPage: emptyNettiautoSearchResultPage({
              crawlKind: sourceQuery.crawlKind,
              pageNumber: command.pageNumber,
            }),
          });
          throw new RetryableNettiautoFetchError(
            failureReason,
            `Nettiauto search request failed (${failureReason}).`,
          );
        }

        if (!response.ok || response.redirected) {
          const failureReason = classifySearchFetchFailure(
            response.status,
            response.redirected,
            response.bodyShape,
          );
          await persistSearchResultPage(input.sql, {
            crawlRunId: command.crawlRunId,
            searchQueryId: sourceQuery.id,
            crawlKind: sourceQuery.crawlKind,
            vehicleCategory: sourceQuery.vehicleCategory,
            sourceUrl: pageUrl,
            pageNumber: command.pageNumber,
            attemptNumber: context.attemptNumber,
            responseStatus: response.status,
            responseContentType: response.contentType,
            responseBodyShape: response.bodyShape,
            responseBodySha256: response.bodySha256,
            responseBytes: response.bodyBytes,
            durationMs: response.durationMs,
            requestHeaders,
            errorType: failureReason,
            errorMessage: response.redirected
              ? "Nettiauto request redirected before AJAX JSON was returned."
              : `Nettiauto returned HTTP ${response.status} instead of AJAX JSON.`,
            parsedPage: emptyNettiautoSearchResultPage({
              crawlKind: sourceQuery.crawlKind,
              pageNumber: command.pageNumber,
            }),
          });
          input.logger.warn(
            {
              jobId: context.jobId,
              task: "crawl_nettiauto_search_page",
              crawlRunId: command.crawlRunId,
              sourceQueryId: sourceQuery.id,
              page: command.pageNumber,
              statusCode: response.status,
              responseBodyShape: response.bodyShape,
              responseContentType: response.contentType,
              responseBytes: response.bodyBytes,
              responseBodySha256: response.bodySha256,
              durationMs: response.durationMs,
              failureReason,
            },
            "Nettiauto search result fetch stopped crawl",
          );
          if (shouldPauseNettiautoSource(failureReason)) {
            const pausedUntil = await pauseSourceSearchQuery(input.sql, sourceQuery.id, {
              pauseMs: input.config.CRAWLER_BLOCK_PAUSE_MS,
              reason: failureReason,
              now: new Date(now()),
            });
            await completeCrawlRun(input.sql, {
              crawlRunId: command.crawlRunId,
              cause: { kind: "source_failure", reason: failureReason },
            });
            input.logger.warn(
              { sourceQueryId: sourceQuery.id, pausedUntil, failureReason },
              "Nettiauto source query paused",
            );
            return { kind: "stopped" };
          }
          if (isRetryableNettiautoHttpStatus(response.status)) {
            throw new RetryableNettiautoFetchError(
              failureReason,
              `Nettiauto search request returned transient HTTP ${response.status}.`,
            );
          }
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "source_failure", reason: failureReason },
          });
          return { kind: "stopped" };
        }

        if (response.bodyShape !== "ajax_json") {
          const failureReason = response.bodyShape === "html_document"
            ? "unexpected_html_response"
            : "unexpected_response_body_shape";
          await persistSearchResultPage(input.sql, {
            crawlRunId: command.crawlRunId,
            searchQueryId: sourceQuery.id,
            crawlKind: sourceQuery.crawlKind,
            vehicleCategory: sourceQuery.vehicleCategory,
            sourceUrl: pageUrl,
            pageNumber: command.pageNumber,
            attemptNumber: context.attemptNumber,
            responseStatus: response.status,
            responseContentType: response.contentType,
            responseBodyShape: response.bodyShape,
            responseBodySha256: response.bodySha256,
            responseBytes: response.bodyBytes,
            durationMs: response.durationMs,
            requestHeaders,
            errorType: failureReason,
            errorMessage: `Nettiauto returned ${response.bodyShape} instead of AJAX JSON.`,
            parsedPage: emptyNettiautoSearchResultPage({
              crawlKind: sourceQuery.crawlKind,
              pageNumber: command.pageNumber,
            }),
          });
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "source_failure", reason: failureReason },
          });
          input.logger.warn(
            {
              jobId: context.jobId,
              task: "crawl_nettiauto_search_page",
              crawlRunId: command.crawlRunId,
              sourceQueryId: sourceQuery.id,
              page: command.pageNumber,
              statusCode: response.status,
              responseBodyShape: response.bodyShape,
              responseContentType: response.contentType,
              responseBytes: response.bodyBytes,
              responseBodySha256: response.bodySha256,
              durationMs: response.durationMs,
              failureReason,
            },
            "Nettiauto search result response shape stopped crawl",
          );
          await pauseSourceSearchQuery(input.sql, sourceQuery.id, {
            pauseMs: input.config.CRAWLER_BLOCK_PAUSE_MS,
            reason: failureReason,
            now: new Date(now()),
          });
          return { kind: "stopped" };
        }

        const parsedPage = parseNettiautoAjaxSearchResult(response.body, {
          crawlKind: sourceQuery.crawlKind,
          pageNumber: command.pageNumber,
        });
        await persistSearchResultPage(input.sql, {
          crawlRunId: command.crawlRunId,
          searchQueryId: sourceQuery.id,
          crawlKind: sourceQuery.crawlKind,
          vehicleCategory: sourceQuery.vehicleCategory,
          sourceUrl: pageUrl,
          pageNumber: command.pageNumber,
          attemptNumber: context.attemptNumber,
          responseStatus: response.status,
          responseContentType: response.contentType,
          responseBodyShape: response.bodyShape,
          responseBodySha256: response.bodySha256,
          responseBytes: response.bodyBytes,
          durationMs: response.durationMs,
          requestHeaders,
          parsedPage,
        });

        const detailCandidates = input.config.CRAWLER_DETAIL_ENABLED
          ? parsedPage.listings.flatMap((listing) => {
              const sourceUrl = listing.normalized.sourceUrl;
              return sourceUrl ? [{ listing, sourceUrl }] : [];
            })
          : [];
        const detailJobCount = await reserveCrawlRunDetailJobs(
          input.sql,
          command.crawlRunId,
          detailCandidates.length,
          input.config.CRAWLER_DETAIL_MAX_PER_RUN,
        );
        for (const [index, candidate] of detailCandidates.slice(0, detailJobCount).entries()) {
          try {
            await input.workQueue.enqueueDetailPage({
              crawlRunId: command.crawlRunId,
              searchQueryId: sourceQuery.id,
              sourceListingId: candidate.listing.sourceListingId,
              sourceUrl: candidate.sourceUrl,
              priority: sourceQuery.priority + NETTIAUTO_DETAIL_PRIORITY_OFFSET,
              runAt: new Date(now() + index * input.config.CRAWLER_DELAY_MS),
            });
          } catch (error) {
            input.logger.warn(
              {
                error,
                crawlRunId: command.crawlRunId,
                sourceQueryId: sourceQuery.id,
                sourceListingId: candidate.listing.sourceListingId,
              },
              "Optional Nettiauto detail enrichment could not be scheduled",
            );
          }
        }

        input.logger.info(
          {
            jobId: context.jobId,
            task: "crawl_nettiauto_search_page",
            crawlRunId: command.crawlRunId,
            sourceQueryId: sourceQuery.id,
            page: command.pageNumber,
            parserVersion: parsedPage.parserVersion,
            durationMs: response.durationMs,
            status: "parsed",
            parsedListingCount: parsedPage.listings.length,
            issueCount: parsedPage.issues.length,
          },
          "Nettiauto search result page persisted",
        );

        if (parsedPage.issues.some((issue) => issue.code === "invalid_ajax_json")) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "source_failure", reason: "invalid_ajax_json" },
          });
          return { kind: "stopped" };
        }
        if (crawlAllPages && parsedPage.totalPages === null) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "source_failure", reason: "missing_total_page_for_uncapped_crawl" },
          });
          return { kind: "stopped" };
        }
        if (parsedPage.totalPages !== null && command.pageNumber >= parsedPage.totalPages) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "source_exhausted" },
          });
          return { kind: "completed" };
        }
        if (Number.isFinite(maxPages) && command.pageNumber >= maxPages) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: { kind: "page_limit_reached", reason: "max_pages_per_run_reached" },
          });
          return { kind: "completed" };
        }

        await input.workQueue.enqueueSearchResultPage({
          crawlRunId: command.crawlRunId,
          sourceQueryId: sourceQuery.id,
          pageNumber: command.pageNumber + 1,
          priority: sourceQuery.priority,
          runAt: new Date(now() + input.config.CRAWLER_DELAY_MS),
        });
        return { kind: "continued" };
      } catch (error) {
        if (context.attemptNumber >= context.maxAttempts) {
          await completeCrawlRun(input.sql, {
            crawlRunId: command.crawlRunId,
            cause: {
              kind: "source_failure",
              reason: error instanceof RetryableNettiautoFetchError
                ? error.failureReason
                : error instanceof Error
                  ? error.message
                  : "unknown_error",
            },
          });
        }
        throw error;
      }
    },

    async enrichDetailPage(command, context) {
      if (!input.config.CRAWLER_ENABLED || input.config.CRAWLER_PAUSED) {
        if (command.detailBackfillRunId) {
          return {
            kind: "stopped",
            failureReason: input.config.CRAWLER_ENABLED ? "crawler_paused" : "crawler_disabled",
            blockedUntil: null,
          };
        }
        input.logger.info(
          {
            jobId: context.jobId,
            task: "crawl_nettiauto_detail_page",
            sourceListingId: command.sourceListingId,
            crawlerEnabled: input.config.CRAWLER_ENABLED,
            crawlerPaused: input.config.CRAWLER_PAUSED,
          },
          "Nettiauto detail crawl skipped",
        );
        return { kind: "skipped", reason: "crawler_unavailable" };
      }

      const [sourceQuery] = await input.sql<
        { enabled: boolean; pausedUntil: string | null; pauseReason: string | null }[]
      >`
        select
          enabled,
          paused_until::text as "pausedUntil",
          pause_reason as "pauseReason"
        from source_search_queries
        where id = ${command.searchQueryId}
          and source = 'nettiauto'
        limit 1
      `;
      if (!sourceQuery?.enabled) {
        if (command.detailBackfillRunId) {
          return {
            kind: "stopped",
            failureReason: "source_query_disabled",
            blockedUntil: null,
          };
        }
        input.logger.info(
          {
            jobId: context.jobId,
            sourceListingId: command.sourceListingId,
            pausedUntil: sourceQuery?.pausedUntil ?? null,
            pauseReason: sourceQuery?.pauseReason ?? null,
          },
          "Nettiauto detail crawl skipped because source query is unavailable",
        );
        return { kind: "skipped", reason: "source_unavailable" };
      }

      if (
        !command.detailBackfillRunId
        && sourceQuery.pausedUntil
        && new Date(sourceQuery.pausedUntil).getTime() > now()
      ) {
        input.logger.info(
          {
            jobId: context.jobId,
            sourceListingId: command.sourceListingId,
            pausedUntil: sourceQuery.pausedUntil,
            pauseReason: sourceQuery.pauseReason,
          },
          "Nettiauto detail crawl skipped because source query is unavailable",
        );
        return { kind: "skipped", reason: "source_unavailable" };
      }

      if (!command.force) {
        const [existing] = await input.sql<
          { sourceUpdatedDate: string | null; detailParserVersion: string | null }[]
        >`
          select detail.source_updated_date::text as "sourceUpdatedDate",
                 detail.source_parser_version as "detailParserVersion"
          from listings
          left join listing_details detail on detail.listing_id = listings.id
          where listings.source = 'nettiauto'
            and listings.source_listing_id = ${command.sourceListingId}
          limit 1
        `;
        if (existing?.detailParserVersion === NETTIAUTO_DETAIL_PARSER_VERSION) {
          input.logger.info(
            {
              jobId: context.jobId,
              task: "crawl_nettiauto_detail_page",
              sourceListingId: command.sourceListingId,
              sourceUpdatedDate: existing.sourceUpdatedDate,
              detailParserVersion: existing.detailParserVersion,
            },
            "Nettiauto detail crawl skipped because latest snapshot already has parsed detail data",
          );
          return { kind: "skipped", reason: "already_current" };
        }
      }

      const requestHeaders = nettiautoDetailRequestHeaders(command.sourceUrl);
      let response: NettiautoSourceResponse;
      try {
        response = await input.source.fetchDetailPage({
          sourceUrl: command.sourceUrl,
          requestHeaders,
          parentSignal: context.abortSignal,
          timeoutMs: input.config.CRAWLER_REQUEST_TIMEOUT_MS,
        });
      } catch (error) {
        const failureReason = error instanceof NettiautoSourceError
          ? error.failureReason
          : "network_error";
        const durationMs = error instanceof NettiautoSourceError ? error.durationMs : null;
        await persistNettiautoDetailPage(input.sql, {
          crawlRunId: command.crawlRunId,
          detailBackfillRunId: command.detailBackfillRunId ?? null,
          searchQueryId: command.searchQueryId,
          sourceListingId: command.sourceListingId,
          sourceUrl: command.sourceUrl,
          attemptNumber: context.attemptNumber,
          responseStatus: null,
          responseContentType: null,
          responseBodyShape: "unknown",
          responseBodySha256: null,
          responseBytes: null,
          durationMs,
          requestHeaders,
          errorType: failureReason,
          errorMessage: `Nettiauto detail request ended before a response (${failureReason}).`,
          parsedDetail: null,
        });
        throw new RetryableNettiautoFetchError(
          failureReason,
          `Nettiauto detail request failed (${failureReason}).`,
        );
      }

      const canParse = response.ok && ["html_document", "html_fragment"].includes(response.bodyShape);
      const parsedCandidate = canParse
        ? parseNettiautoDetailPage(response.body, { sourceListingId: command.sourceListingId })
        : null;
      const parsedDetail = parsedCandidate && hasUsableNettiautoDetailEvidence(parsedCandidate)
        ? parsedCandidate
        : null;
      const failureReason = !canParse
        ? classifyDetailFetchFailure(response.status, response.bodyShape)
        : parsedDetail
          ? null
          : "insufficient_detail_evidence";
      const result = await persistNettiautoDetailPage(input.sql, {
        crawlRunId: command.crawlRunId,
        detailBackfillRunId: command.detailBackfillRunId ?? null,
        searchQueryId: command.searchQueryId,
        sourceListingId: command.sourceListingId,
        sourceUrl: command.sourceUrl,
        attemptNumber: context.attemptNumber,
        responseStatus: response.status,
        responseContentType: response.contentType,
        responseBodyShape: response.bodyShape,
        responseBodySha256: response.bodySha256,
        responseBytes: response.bodyBytes,
        durationMs: response.durationMs,
        requestHeaders,
        errorType: failureReason,
        errorMessage: failureReason
          ? `Nettiauto detail page returned ${response.bodyShape} with HTTP ${response.status}.`
          : null,
        parsedDetail,
      });

      const heroSource = parsedDetail?.images
        .slice()
        .sort((left, right) =>
          (left.position ?? Number.MAX_SAFE_INTEGER) -
          (right.position ?? Number.MAX_SAFE_INTEGER),
        )[0];
      if (
        heroSource &&
        result.listingId &&
        result.rawListingRecordId &&
        input.heroImageArchiver
      ) {
        try {
          await input.heroImageArchiver.archive({
            listingId: result.listingId,
            sourceRawListingRecordId: result.rawListingRecordId,
            sourceImageUrl: heroSource.imageUrl,
          });
        } catch (error) {
          input.logger.warn(
            { error, sourceListingId: command.sourceListingId },
            "Nettiauto listing hero image could not be archived",
          );
        }
      }

      if (failureReason && shouldPauseNettiautoSource(failureReason)) {
        if (command.detailBackfillRunId) {
          return {
            kind: "stopped",
            failureReason,
            blockedUntil: new Date(now() + input.config.CRAWLER_BLOCK_PAUSE_MS).toISOString(),
          };
        }
        const pausedUntil = await pauseSourceSearchQuery(input.sql, command.searchQueryId, {
          pauseMs: input.config.CRAWLER_BLOCK_PAUSE_MS,
          reason: failureReason,
          now: new Date(now()),
        });
        input.logger.warn(
          { sourceListingId: command.sourceListingId, pausedUntil, failureReason },
          "Nettiauto source query paused after detail fetch failure",
        );
        return { kind: "stopped", failureReason, blockedUntil: pausedUntil };
      }
      if (isRetryableNettiautoHttpStatus(response.status)) {
        throw new RetryableNettiautoFetchError(
          failureReason ?? `http_${response.status}`,
          `Nettiauto detail request returned transient HTTP ${response.status}.`,
        );
      }

      input.logger.info(
        {
          jobId: context.jobId,
          task: "crawl_nettiauto_detail_page",
          sourceListingId: command.sourceListingId,
          sourceFetchId: result.sourceFetchId,
          sourceUpdatedDate: result.sourceUpdatedDate,
          durationMs: response.durationMs,
          responseBodyShape: response.bodyShape,
        },
        "Nettiauto detail page persisted",
      );
      return {
        kind: "persisted",
        outcome: parsedDetail
          ? "parsed"
          : [404, 410].includes(response.status)
            ? "unavailable"
            : "failed",
        failureReason,
        responseStatus: response.status,
      };
    },
  };
}

function classifySearchFetchFailure(statusCode: number, redirected: boolean, bodyShape: string) {
  if (redirected || [301, 302, 303, 307, 308].includes(statusCode)) {
    return "redirected";
  }
  if (statusCode === 429) {
    return "rate_limited";
  }
  if (statusCode === 403) {
    return "blocked";
  }
  if (statusCode >= 400) {
    return `http_${statusCode}`;
  }
  if (bodyShape !== "ajax_json") {
    return "unexpected_response_body_shape";
  }
  return "fetch_failed";
}

function classifyDetailFetchFailure(statusCode: number, bodyShape: string) {
  if ([301, 302, 303, 307, 308].includes(statusCode)) {
    return "redirected";
  }
  if (statusCode === 429) {
    return "rate_limited";
  }
  if (statusCode === 403) {
    return "blocked";
  }
  if (statusCode >= 400) {
    return `http_${statusCode}`;
  }
  if (bodyShape !== "html_document" && bodyShape !== "html_fragment") {
    return "unexpected_response_body_shape";
  }
  return "fetch_failed";
}
