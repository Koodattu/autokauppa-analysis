// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicListingDetailResponse } from "@nettiauto/schemas";
import { VehicleComparison } from "./vehicle-comparison";

const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));
afterEach(() => { navigation.search = ""; });

function car(id: string, price: number | null): PublicListingDetailResponse {
  return {
    listing: {
      listingId: id, sourceListingId: "synthetic", make: "Toyota", model: "Corolla", yearModel: 2020,
      availability: "active", askingPriceEur: price, observedSoldPriceEur: null, mileageKm: 100000,
      seller: null, sellerType: null, sourceUpdatedDate: null, lastSeenAt: "2026-10-02", firstSeenAt: "2026-09-01",
      sourceAttribution: { source: "Nettiauto", sourceUrl: null, sourceListingId: "synthetic", observedDataLabel: "Search Result Data" },
    },
    history: [], imageMetadata: [], vehicleDetails: null,
    marketContext: { cohortDescription: "Same model", priceBasis: "asking", sampleSize: 0,
      priceP25Eur: null, medianPriceEur: null, priceP75Eur: null, pricePercentile: null,
      observedDays: 31, recordedPriceChangeCount: 0 },
  };
}

describe("comparison price evidence", () => {
  it("explains a comparison with no recorded differences instead of leaving a blank table", () => {
    navigation.search = "ids=a,b&differences=1";
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 20000)]} />);
    expect(container.textContent).toContain("No recorded differences in these fields");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Show all details")).toBe(true);
  });

  it("shows all details for one car and falls back to an available reference", () => {
    navigation.search = "ids=a&reference=missing&differences=1";
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000)]} />);
    expect(container.querySelector("select")?.value).toBe("a");
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
    expect(container.textContent).toContain("20\u00a0000 €");
    expect(container.textContent).toContain("Choose another car to compare");
  });

  it("restores the chosen reference and differences from a shared URL and keeps them in detail return links", () => {
    navigation.search = "ids=a,b&reference=b&differences=1";
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 30000)]} />);
    expect(container.querySelector("select")?.value).toBe("b");
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(container.textContent).toContain("-10\u00a0000 €");
    expect([...container.querySelectorAll("tbody th")].map((row) => row.textContent)).not.toContain("Availability");
    const detail = new URL(container.querySelector<HTMLAnchorElement>("thead a")!.href);
    const back = new URL(detail.searchParams.get("returnTo")!, "https://example.test");
    expect(back.pathname).toBe("/compare");
    expect(Object.fromEntries(back.searchParams)).toEqual({ ids: "a,b", reference: "b", differences: "1" });
    expect(back.hash).toBe("#car-comparison");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Copy link")).toBe(true);
  });

  it("can remove the reference car from a shared comparison while retaining the other car", () => {
    navigation.search = "ids=a,b&reference=b&differences=1";
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 30000)]} />);
    const removals = [...container.querySelectorAll<HTMLAnchorElement>('a[aria-label^="Remove"]')];
    expect(removals).toHaveLength(2);
    const remaining = new URL(removals[1].href);
    expect(Object.fromEntries(remaining.searchParams)).toEqual({ ids: "a" });
    expect(remaining.hash).toBe("#car-comparison");
  });

  it("does not display an unpriced car as free or subtract it from a priced reference", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 0)]} />);
    const rows = [...container.querySelectorAll("tbody tr")];
    const values = (label: string) => [...rows.find((row) => row.querySelector("th")?.textContent === label)!.querySelectorAll("td")].map((cell) => cell.textContent);
    expect(values("Price")).toEqual(["20\u00a0000 €", "Not recorded"]);
    expect(values("Difference from reference")).toEqual(["0 €", "Prices not recorded"]);
  });
});
