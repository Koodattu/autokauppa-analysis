import { describe, expect, it, vi } from "vitest";
import type { AnalyticsTrendResponse } from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import type { ListingFiltersQuery } from "@nettiauto/schemas";
import { AnalyticsTrendCache } from "./analytics-cache";

const query: ListingFiltersQuery = {
  availability: "all",
  interval: "week",
};

describe("AnalyticsTrendCache", () => {
  it("deduplicates concurrent cold loads for the same query", async () => {
    let resolveLoad: (value: AnalyticsTrendResponse) => void = () => {};
    const loader = vi.fn<(query: ListingFiltersQuery) => Promise<AnalyticsTrendResponse>>(
      () =>
        new Promise<AnalyticsTrendResponse>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const cache = createCache(loader);

    const first = cache.get(query);
    const second = cache.get(query);
    resolveLoad(responseWithCount(10));

    await expect(first).resolves.toMatchObject({ status: "miss", value: responseWithCount(10) });
    await expect(second).resolves.toMatchObject({ status: "miss", value: responseWithCount(10) });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serves stale data while refreshing an expired entry", async () => {
    let now = 0;
    let resolveRefresh: (value: AnalyticsTrendResponse) => void = () => {};
    const loader = vi
      .fn<(query: ListingFiltersQuery) => Promise<AnalyticsTrendResponse>>()
      .mockResolvedValueOnce(responseWithCount(10))
      .mockImplementationOnce(
        () =>
          new Promise<AnalyticsTrendResponse>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const cache = createCache(loader, () => now);

    await expect(cache.get(query)).resolves.toMatchObject({
      status: "miss",
      value: responseWithCount(10),
    });

    now = 101;
    await expect(cache.get(query)).resolves.toMatchObject({
      status: "stale",
      value: responseWithCount(10),
    });
    expect(loader).toHaveBeenCalledTimes(2);

    const refreshPromise = loader.mock.results[1]?.value;
    resolveRefresh(responseWithCount(20));
    await refreshPromise;

    await expect(cache.get(query)).resolves.toMatchObject({
      status: "hit",
      value: responseWithCount(20),
    });
  });
});

function createCache(
  loader: (query: ListingFiltersQuery) => Promise<AnalyticsTrendResponse>,
  now?: () => number,
) {
  return new AnalyticsTrendCache({
    ttlMs: 100,
    maxEntries: 4,
    loader,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as AppLogger,
    now,
  });
}

function responseWithCount(listingCount: number): AnalyticsTrendResponse {
  return {
    appliedFilters: query,
    coverage: {
      lastRelevantCrawlAt: null,
      sampleSize: listingCount,
      includesCurrent: false,
      includesSold: false,
      dataSource: "search_result_data",
      completeness: "unknown",
    },
    summary: {
      listingCount,
      activeCount: 0,
      soldCount: 0,
      medianAskingPriceEur: null,
      medianObservedSoldPriceEur: null,
      medianMileageKm: null,
    },
    timeSeries: [],
    breakdowns: {
      byMake: [],
    },
    charts: {
      marketOverTime: [],
      priceByYear: [],
      priceByMileageBucket: [],
      priceMileageScatter: [],
    },
  };
}
