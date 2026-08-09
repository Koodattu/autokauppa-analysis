import { describe, expect, it } from "vitest";
import { evaluateCrawlRunCompletionQuality } from "./persistence";

const completeEvidence = {
  expectedPageCount: 3,
  sourceTotalAds: 100,
  successfulPageCount: 3,
  minimumSuccessfulPage: 1,
  maximumSuccessfulPage: 3,
  observedListingCount: 98,
};

describe("crawl completion quality", () => {
  it("accepts contiguous successful pages with sufficient distinct listings", () => {
    expect(evaluateCrawlRunCompletionQuality(completeEvidence)).toBeNull();
  });

  it("rejects missing pages", () => {
    expect(
      evaluateCrawlRunCompletionQuality({
        ...completeEvidence,
        successfulPageCount: 2,
        maximumSuccessfulPage: 2,
      }),
    ).toBe("incomplete_search_page_coverage");
  });

  it("rejects listing coverage below 98 percent", () => {
    expect(
      evaluateCrawlRunCompletionQuality({ ...completeEvidence, observedListingCount: 97 }),
    ).toBe("insufficient_listing_coverage");
  });

  it("accepts an empty source result after the first page was fetched", () => {
    expect(
      evaluateCrawlRunCompletionQuality({
        expectedPageCount: 0,
        sourceTotalAds: 0,
        successfulPageCount: 1,
        minimumSuccessfulPage: 1,
        maximumSuccessfulPage: 1,
        observedListingCount: 0,
      }),
    ).toBeNull();
  });
});
