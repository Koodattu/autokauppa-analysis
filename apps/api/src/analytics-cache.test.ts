import { describe, expect, it, vi } from "vitest";
import type { AnalyticsTimeSeriesResponse } from "@nettiauto/domain";
import type { AppLogger } from "@nettiauto/logging";
import type { ListingFiltersQuery } from "@nettiauto/schemas";
import { ResponseCache } from "./analytics-cache";

const query: ListingFiltersQuery = {
  availability: "all",
  interval: "week",
};

describe("ResponseCache", () => {
  it("evicts the oldest completed entries after simultaneous cold loads exceed capacity", async () => {
    const loader = vi.fn(async (input: ListingFiltersQuery) => responseWithCount(input.modelYear!));
    let time = 0;
    const cache = createCache(loader, () => time++);
    await Promise.all([2015, 2016, 2017, 2018, 2019, 2020].map((modelYear) => cache.get({ ...query, modelYear })));

    // Capacity is four: the newest result survives, the first two must reload.
    expect(await cache.get({ ...query, modelYear: 2020 })).toMatchObject({ status: "hit", value: responseWithCount(2020) });
    expect(await cache.get({ ...query, modelYear: 2015 })).toMatchObject({ status: "miss" });
    expect(await cache.get({ ...query, modelYear: 2016 })).toMatchObject({ status: "miss" });
  });

  it("deduplicates concurrent cold loads for the same query", async () => {
    let resolveLoad: (value: AnalyticsTimeSeriesResponse) => void = () => {};
    const loader = vi.fn<(query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>>(
      () =>
        new Promise<AnalyticsTimeSeriesResponse>((resolve) => {
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
    let resolveRefresh: (value: AnalyticsTimeSeriesResponse) => void = () => {};
    const loader = vi
      .fn<(query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>>()
      .mockResolvedValueOnce(responseWithCount(10))
      .mockImplementationOnce(
        () =>
          new Promise<AnalyticsTimeSeriesResponse>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const cache = createCache(loader, () => now);

    await expect(cache.get(query)).resolves.toMatchObject({
      status: "miss",
      value: responseWithCount(10),
    });

    now = 101;
    const concurrentRequests = await Promise.all([cache.get(query), cache.get(query), cache.get(query)]);
    for (const response of concurrentRequests) {
      expect(response).toMatchObject({ status: "stale", value: responseWithCount(10) });
    }
    expect(loader).toHaveBeenCalledTimes(2);

    const refreshPromise = loader.mock.results[1]?.value;
    resolveRefresh(responseWithCount(20));
    await refreshPromise;

    await expect(cache.get(query)).resolves.toMatchObject({
      status: "hit",
      value: responseWithCount(20),
    });
  });

  it("keeps exact year, fuel, and transmission filters in separate entries", async () => {
    const loader = vi.fn<(query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>>(
      (input) => Promise.resolve(responseWithCount(
        (input.modelYear ?? 0) + (input.fuelType ? 1 : 0) + (input.transmission ? 1 : 0),
      )),
    );
    const cache = createCache(loader);

    await cache.get({ ...query, modelYear: 2018 });
    await cache.get({ ...query, modelYear: 2019 });
    await cache.get({ ...query, modelYear: 2019, fuelType: "Diesel" });
    await cache.get({ ...query, modelYear: 2019, transmission: "Automatic" });

    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("keeps the last good response on refresh failure and retries only on demand", async () => {
    let now = 0;
    const loader = vi.fn<(query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>>()
      .mockResolvedValueOnce(responseWithCount(10))
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce(responseWithCount(20));
    const cache = createCache(loader, () => now);
    await cache.get(query);
    now = 101;
    await expect(cache.get(query)).resolves.toMatchObject({ status: "stale", value: responseWithCount(10) });
    // Let the failed refresh settle before the next request.
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    now = 1000;
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(cache.get(query)).resolves.toMatchObject({ status: "stale", value: responseWithCount(10) });
    await vi.waitFor(async () => {
      expect(await cache.get(query)).toMatchObject({ status: "hit", value: responseWithCount(20) });
    });
    expect(loader).toHaveBeenCalledTimes(3);
  });
});

function createCache(
  loader: (query: ListingFiltersQuery) => Promise<AnalyticsTimeSeriesResponse>,
  now?: () => number,
) {
  return new ResponseCache<ListingFiltersQuery, AnalyticsTimeSeriesResponse>({
    name: "test",
    ttlMs: 100,
    maxEntries: 4,
    key: (input) => JSON.stringify(input),
    loader,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as AppLogger,
    now,
  });
}

function responseWithCount(listingCount: number): AnalyticsTimeSeriesResponse {
  return {
    appliedFilters: query,
    marketOverTime: [
      {
        bucket: "2026-01-01",
        listingCount,
        activeCount: listingCount,
        soldCount: 0,
        newListingCount: 0,
        includesCurrentRun: true,
        includesSoldRun: true,
        medianAskingPriceEur: null,
        medianObservedSoldPriceEur: null,
        sampleSize: listingCount,
        askingPriceSampleSize: 0,
        observedSoldPriceSampleSize: 0,
      },
    ],
  };
}
