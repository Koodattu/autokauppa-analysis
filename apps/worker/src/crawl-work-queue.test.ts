import type { AddJobFunction } from "graphile-worker";
import { describe, expect, it, vi } from "vitest";
import { createGraphileCrawlWorkQueue } from "./crawl-work-queue";

describe("Graphile crawl work queue", () => {
  it("owns task identifiers, retry policy, and idempotency keys", async () => {
    const addJob = vi.fn(async () => ({})) as unknown as AddJobFunction;
    const queue = createGraphileCrawlWorkQueue(addJob);

    await queue.enqueueSearchPage({
      crawlRunId: "run-1",
      sourceQueryId: "query-1",
      pageNumber: 2,
      priority: 10,
    });
    await queue.enqueueDetailPage({
      crawlRunId: "run-1",
      searchQueryId: "query-1",
      sourceListingId: "listing-1",
      sourceUrl: "https://www.nettiauto.com/vehicle/1",
      priority: 110,
    });

    expect(addJob).toHaveBeenNthCalledWith(
      1,
      "crawl_nettiauto_search_page",
      { crawlRunId: "run-1", sourceQueryId: "query-1", pageNumber: 2 },
      expect.objectContaining({
        jobKey: "nettiauto:search-page:run-1:2",
        maxAttempts: 5,
        priority: 10,
      }),
    );
    expect(addJob).toHaveBeenNthCalledWith(
      2,
      "crawl_nettiauto_detail_page",
      expect.objectContaining({ sourceListingId: "listing-1" }),
      expect.objectContaining({
        jobKey: "nettiauto:detail:run-1:listing-1",
        maxAttempts: 3,
        priority: 110,
      }),
    );
  });
});
