// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicListingDetailResponse } from "@nettiauto/schemas";
import { publicListingDetailResponseSchema } from "@nettiauto/schemas";
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
  it("compares individual recorded equipment and hides common items in differences mode without claiming absence", () => {
    function equipped(id: string, items: string[]) {
      const base = car(id, 20000);
      const detailShape = publicListingDetailResponseSchema.shape.vehicleDetails.unwrap().shape;
      const emptyDetails = Object.fromEntries(Object.keys(detailShape).map((key) => [key, key === "equipmentGroups" ? [] : null]));
      return publicListingDetailResponseSchema.parse({ ...base, listing: { ...base.listing, listingId: id },
        vehicleDetails: { ...emptyDetails, equipmentGroups: [{ label: "Comfort", items }] } });
    }
    const first = equipped("00000000-0000-4000-8000-000000000001", ["Heated seats", "Reversing camera"]);
    const second = equipped("00000000-0000-4000-8000-000000000002", ["Heated seats", "Glass roof"]);
    navigation.search = "differences=1";
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[first, second]} />);
    const equipment = container.querySelector('table[aria-label="Recorded equipment comparison"]');
    expect(equipment).not.toBeNull();
    const rows = [...equipment!.querySelectorAll("tbody tr")];
    expect(rows.map((row) => row.querySelector("th")?.textContent)).toEqual(["Glass roof", "Reversing camera"]);
    expect([...rows[0].querySelectorAll("td")].map((cell) => cell.textContent)).toEqual(["Not recorded", "Recorded"]);
    expect(container.textContent).toContain("Not recorded does not mean absent");
    navigation.search = "";
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[first, second]} />);
    expect(container.querySelector('table[aria-label="Recorded equipment comparison"]')?.textContent).toContain("Heated seats");
    navigation.search = "differences=1";
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[first, { ...first, listing: second.listing }]} />);
    expect(container.textContent).toContain("No recorded equipment differences");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Show all equipment")).toBe(true);
  });
  it("explains how to make room when all four comparison positions are occupied", () => {
    const markup = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 21000), car("c", 22000), car("d", 23000)]} />);
    expect(markup).toContain("Four cars compared. Remove a car from this view before choosing another.");
    expect(markup).not.toContain("Choose more cars");
  });
  it("explicitly continues a shared comparison without changing saved cars or views on opening", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const id1 = "00000000-0000-4000-8000-000000000001", id2 = "00000000-0000-4000-8000-000000000002";
    const saved = { cars: [{ id: "00000000-0000-4000-8000-000000000003", title: "Earlier selection" }],
      shortlist: [{ id: id1, title: "My saved car" }], searches: [{ title: "My view", href: "/analyze?make=Toyota" }] };
    localStorage.setItem("nettiauto-saved-v2", JSON.stringify(saved));
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    // Stop jsdom navigation after the link's own handler, and observe whether it allowed navigation.
    let prevented = false;
    container.addEventListener("click", (event) => { prevented = event.defaultPrevented; event.preventDefault(); });
    try {
      await act(async () => root.render(<VehicleComparison cars={[car(id1, 20000), car(id2, 30000)]} />));
      expect(JSON.parse(localStorage.getItem("nettiauto-saved-v2")!)).toEqual(saved);
      const link = [...container.querySelectorAll<HTMLAnchorElement>("a")].find((item) => item.textContent === "Choose more cars");
      expect(link).toBeDefined();
      const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("Full", "QuotaExceededError"); });
      await act(async () => link!.click());
      expect(prevented).toBe(true);
      expect(container.textContent).toContain("Your browser could not save this");
      expect(JSON.parse(localStorage.getItem("nettiauto-saved-v2")!)).toEqual(saved);
      write.mockRestore();
      await act(async () => link!.click());
      expect(prevented).toBe(false);
      expect(link?.getAttribute("href")).toBe("/listings#listing-results");
      const next = JSON.parse(localStorage.getItem("nettiauto-saved-v2")!);
      expect(next.cars.map((item: { id: string }) => item.id)).toEqual([id1, id2]);
      expect(next.shortlist).toEqual(saved.shortlist);
      expect(next.searches).toEqual(saved.searches);
    } finally {
      await act(async () => root.unmount()); container.remove();
      localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });
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
