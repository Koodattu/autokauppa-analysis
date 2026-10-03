// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicListingDetailResponse } from "@nettiauto/schemas";
import { VehicleComparison } from "./vehicle-comparison";

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
  it("does not display an unpriced car as free or subtract it from a priced reference", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<VehicleComparison cars={[car("a", 20000), car("b", 0)]} />);
    const rows = [...container.querySelectorAll("tbody tr")];
    const values = (label: string) => [...rows.find((row) => row.querySelector("th")?.textContent === label)!.querySelectorAll("td")].map((cell) => cell.textContent);
    expect(values("Price")).toEqual(["20\u00a0000 €", "Not recorded"]);
    expect(values("Difference from reference")).toEqual(["0 €", "Prices not recorded"]);
  });
});
