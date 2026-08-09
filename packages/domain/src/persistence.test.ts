import { describe, expect, it } from "vitest";
import { classifyCrawlRunCompletion, evaluateCrawlRunCompletionQuality } from "./persistence";

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

describe("crawl completion classification", () => {
  it("completes only source-exhausted runs with complete evidence", () => {
    expect(
      classifyCrawlRunCompletion({ cause: { kind: "source_exhausted" }, ...completeEvidence }),
    ).toEqual({ status: "completed", failureReason: null });
  });

  it("downgrades incomplete source exhaustion based on persisted evidence", () => {
    expect(
      classifyCrawlRunCompletion({
        cause: { kind: "source_exhausted" },
        ...completeEvidence,
        successfulPageCount: 2,
        maximumSuccessfulPage: 2,
      }),
    ).toEqual({ status: "partial", failureReason: "incomplete_search_page_coverage" });
  });

  it("classifies source failures by whether any page succeeded", () => {
    expect(
      classifyCrawlRunCompletion({
        cause: { kind: "source_failure", reason: "blocked" },
        ...completeEvidence,
        successfulPageCount: 0,
        minimumSuccessfulPage: null,
        maximumSuccessfulPage: null,
      }),
    ).toEqual({ status: "failed", failureReason: "blocked" });
    expect(
      classifyCrawlRunCompletion({
        cause: { kind: "source_failure", reason: "blocked" },
        ...completeEvidence,
      }),
    ).toEqual({ status: "partial", failureReason: "blocked" });
  });

  it("records operator stops as cancellations", () => {
    expect(
      classifyCrawlRunCompletion({
        cause: { kind: "operator_stop", reason: "crawler_paused" },
        ...completeEvidence,
      }),
    ).toEqual({ status: "cancelled", failureReason: "crawler_paused" });
  });
});
