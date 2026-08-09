import { describe, expect, it } from "vitest";
import { getListingObservationContext, normalizeMarketOverTimePoint } from "./product";

describe("market time-series coverage", () => {
  it("keeps an unobserved crawl kind distinct from an observed zero", () => {
    const shared = {
      bucket: "2026-08-03",
      listingCount: 12,
      newListingCount: 2,
      medianAskingPriceEur: "20000",
      medianObservedSoldPriceEur: null,
      sampleSize: 12,
      askingPriceSampleSize: 12,
      observedSoldPriceSampleSize: 0,
    };

    expect(normalizeMarketOverTimePoint({
      ...shared,
      activeCount: 12,
      soldCount: null,
      includesCurrentRun: true,
      includesSoldRun: false,
    })).toMatchObject({ activeCount: 12, soldCount: null, medianAskingPriceEur: 20000 });

    expect(normalizeMarketOverTimePoint({
      ...shared,
      activeCount: null,
      soldCount: 0,
      includesCurrentRun: false,
      includesSoldRun: true,
    })).toMatchObject({ activeCount: null, soldCount: 0 });
  });
});

describe("listing observation context", () => {
  it("counts elapsed observation days and recorded price transitions", () => {
    expect(getListingObservationContext([
      { observedAt: "2026-08-01T10:00:00Z", sourceUpdatedDate: null, availability: "active", askingPriceEur: 20_000, observedSoldPriceEur: null, mileageKm: 100_000 },
      { observedAt: "2026-08-02T10:00:00Z", sourceUpdatedDate: null, availability: "active", askingPriceEur: 20_000, observedSoldPriceEur: null, mileageKm: 100_000 },
      { observedAt: "2026-08-04T10:00:00Z", sourceUpdatedDate: null, availability: "active", askingPriceEur: 19_500, observedSoldPriceEur: null, mileageKm: 100_000 },
      { observedAt: "2026-08-06T10:00:00Z", sourceUpdatedDate: null, availability: "sold", askingPriceEur: null, observedSoldPriceEur: 19_000, mileageKm: 100_000 },
    ], "2026-08-01T10:00:00Z", "2026-08-06T10:00:00Z")).toEqual({
      observedDays: 5,
      recordedPriceChangeCount: 2,
    });
  });
});
