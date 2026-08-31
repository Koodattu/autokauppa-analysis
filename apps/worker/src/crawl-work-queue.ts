import type { AddJobFunction } from "graphile-worker";
import {
  NETTIAUTO_DETAIL_MAX_ATTEMPTS,
  NETTIAUTO_SEARCH_MAX_ATTEMPTS,
} from "./nettiauto-fetch-policy";

export interface SearchPageJob {
  crawlRunId: string;
  sourceQueryId: string;
  pageNumber: number;
  priority: number;
  runAt?: Date;
}

export interface DetailPageJob {
  crawlRunId: string;
  searchQueryId: string;
  sourceListingId: string;
  sourceUrl: string;
  priority: number;
  runAt?: Date;
  force?: boolean;
}

export interface CrawlWorkQueue {
  enqueueSearchResultPage(job: SearchPageJob): Promise<void>;
  enqueueDetailPage(job: DetailPageJob): Promise<void>;
}

export function createGraphileCrawlWorkQueue(addJob: AddJobFunction): CrawlWorkQueue {
  return {
    async enqueueSearchResultPage(job) {
      await addJob(
        "crawl_nettiauto_search_page",
        {
          crawlRunId: job.crawlRunId,
          sourceQueryId: job.sourceQueryId,
          pageNumber: job.pageNumber,
        },
        {
          queueName: "nettiauto",
          maxAttempts: NETTIAUTO_SEARCH_MAX_ATTEMPTS,
          jobKey: `nettiauto:search-page:${job.crawlRunId}:${job.pageNumber}`,
          jobKeyMode: "preserve_run_at",
          priority: job.priority,
          runAt: job.runAt,
        },
      );
    },
    async enqueueDetailPage(job) {
      await addJob(
        "crawl_nettiauto_detail_page",
        {
          crawlRunId: job.crawlRunId,
          detailBackfillRunId: null,
          detailBackfillTargetListingId: null,
          searchQueryId: job.searchQueryId,
          sourceListingId: job.sourceListingId,
          sourceUrl: job.sourceUrl,
          force: job.force ?? false,
        },
        {
          queueName: "nettiauto",
          maxAttempts: NETTIAUTO_DETAIL_MAX_ATTEMPTS,
          jobKey: `nettiauto:detail:${job.crawlRunId}:${job.sourceListingId}`,
          jobKeyMode: "preserve_run_at",
          priority: job.priority,
          runAt: job.runAt,
        },
      );
    },
  };
}
