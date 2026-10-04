// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listingSearchUrlFilter, type MarketOverTimePoint, type ResearchResponse } from "@nettiauto/schemas";
import AnalysisPage from "./page";
import { ApiError } from "@/lib/api";

const api = vi.hoisted(() => ({ series: vi.fn(), research: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/server-api", async () => ({
  ApiError: (await import("@/lib/api")).ApiError,
  getAnalyticsTimeSeries: api.series,
  getPriceResearch: api.research,
  getFilterMetadata: async () => ({ makes: ["Toyota", "Tesla"], models: [], yearRange: { min: 2010, max: 2026 }, sellerTypes: [], fuelTypes: [], transmissions: [], availability: ["current", "sold", "all"] }),
}));

function point(bucket: string, price: number | null): MarketOverTimePoint {
  return { bucket, listingCount: 6, activeCount: 6, soldCount: null, newListingCount: 0,
    includesCurrentRun: true, includesSoldRun: false, medianAskingPriceEur: price,
    medianObservedSoldPriceEur: null, sampleSize: price === null ? 0 : 6,
    askingPriceSampleSize: price === null ? 0 : 6, observedSoldPriceSampleSize: 0 };
}

const research: ResearchResponse = {
  mode: "historical", observedFrom: "2026-09-01", observedTo: "2026-09-30", historyFrom: null, historyTo: null,
  coverage: { lastRelevantCrawlAt: "2026-09-30", sampleSize: 6, includesCurrent: true, includesSold: false, dataSource: "search_result_data", completeness: "complete" },
  summary: { count: 6, median: 20000, p25: 18000, p75: 22000, medianMileage: null, medianYear: null },
  fields: { mileage: 0, year: 0, fuel: 0, transmission: 0, body: 0 },
  priceBands: [], yearMileage: [], fuels: [], transmissions: [], bodies: [], models: [], points: [],
  evidencePage: 1, evidencePages: 1, evidence: [],
};

beforeEach(() => {
  api.series.mockReset(); api.research.mockReset();
  api.research.mockResolvedValue(research);
  api.series.mockImplementation(async (query: string) => {
    const parsed = listingSearchUrlFilter.parse(new URLSearchParams(query));
    if (!parsed.ok) throw new Error("Invalid test filters");
    return { appliedFilters: parsed.query, marketOverTime: parsed.query.make === "Tesla"
      ? [point("2026-10-01", 30000), point("2026-10-02", 29000)]
      : [point("2026-08-31", 20000), point("2026-09-07", null), point("2026-09-14", 19000)] };
  });
});

describe("research history journey", () => {
  it("shows both groups' actual historical values and drills into the edited group without losing the other", async () => {
    const params = { make: "Toyota", from: "2026-09-01", to: "2026-09-30", page: "2", comparing: "1",
      compareMake: "Tesla", compareFrom: "2026-10-01", compareTo: "2026-10-02", compareInterval: "day", comparePage: "3" };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve(params) }));
    const histories = container.querySelectorAll("#research-trend .chart-panel");
    expect(histories).toHaveLength(2);
    expect(histories[0].textContent).toContain("20\u00a0000 €");
    expect(histories[1].textContent).toContain("30\u00a0000 €");
    expect(histories[1].textContent).toContain("29\u00a0000 €");
    expect(histories[1].textContent).toContain("Tesla");
    const periodLink = container.querySelector<HTMLAnchorElement>('#comparison-history .period-links a')!;
    expect(periodLink).not.toBeNull();
    const period = new URL(periodLink.href);
    expect(Object.fromEntries(period.searchParams)).toMatchObject({
      make: "Toyota", from: "2026-09-01", to: "2026-09-30", page: "2",
      compareMake: "Tesla", compareFrom: "2026-10-01", compareTo: "2026-10-01", compareInterval: "day",
    });
    expect(period.searchParams.has("comparePage")).toBe(false);
    expect(period.hash).toBe("#comparison-research");
    expect(api.series).toHaveBeenCalledTimes(2);
    const comparedRequest = new URLSearchParams(api.series.mock.calls[1][0]);
    expect(comparedRequest.get("make")).toBe("Tesla");
    expect(comparedRequest.get("interval")).toBe("day");
    expect(comparedRequest.get("from")).toBe("2026-10-01");
  });

  it("keeps the working group visible when the other has no price history", async () => {
    api.series.mockImplementationOnce(async () => ({ appliedFilters: { availability: "current", interval: "week" }, marketOverTime: [] }));
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ make: "Toyota", comparing: "1", compareMake: "Tesla" }) }));
    expect(container.querySelector("#primary-history")?.textContent).toContain("At least two complete current periods");
    expect(container.querySelector("#comparison-history")?.textContent).toContain("29\u00a0000 €");
    expect(container.querySelector("#comparison-history table")?.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("does not request a second history when no comparison is selected", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ make: "Toyota" }) }));
    expect(api.series).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("#research-trend .chart-panel")).toHaveLength(1);
    const values = [...container.querySelectorAll("#research-trend tbody tr")].map((row) => row.textContent);
    expect(values[1]).toContain("–");
    expect(values[1]).not.toContain("0 €");
  });

  it("offers retry without resetting either group when the comparison history fails", async () => {
    api.series.mockResolvedValueOnce({ appliedFilters: { availability: "current", interval: "week" }, marketOverTime: [] });
    api.series.mockRejectedValueOnce(new ApiError("Unavailable", 503));
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(await AnalysisPage({ searchParams: Promise.resolve({ make: "Toyota", comparing: "1", compareMake: "Tesla" }) }));
    expect(container.textContent).toContain("Your filters are kept in the address");
    expect(container.querySelector("button")?.textContent).toBe("Try again");
  });
});
