// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ResearchResponse } from "@nettiauto/schemas";
import { ResearchEvidence } from "./research-results";

function evidence(): ResearchResponse {
  return {
    mode: "historical", observedFrom: "2026-09-01", observedTo: "2026-09-30", historyFrom: null, historyTo: null,
    coverage: { lastRelevantCrawlAt: "2026-09-30", sampleSize: 40, includesCurrent: true, includesSold: false, dataSource: "search_result_data", completeness: "partial" },
    summary: { count: 38, median: 20000, p25: 18000, p75: 22000, medianMileage: null, medianYear: null },
    fields: { mileage: 0, year: 0, fuel: 0, transmission: 0, body: 0 },
    priceBands: [], yearMileage: [], fuels: [], transmissions: [], bodies: [], models: [], points: [],
    evidencePage: 2, evidencePages: 2,
    evidence: [{ listingId: "00000000-0000-4000-8000-000000000001", sourceListingId: "9000000", make: 'Toyota, "Touring"', model: "Corolla", yearModel: 2020, availability: "active", askingPriceEur: 21000, observedSoldPriceEur: null, mileageKm: 80000, seller: "Not exported", sellerType: null, sourceUpdatedDate: null, lastSeenAt: "2026-09-28T09:00:00Z" }],
  };
}

function download(data: ResearchResponse, comparison = false) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ResearchEvidence data={data} params={{ make: "Honda", comparing: "1", compareMake: "Toyota", compareFrom: "2026-09-01", compareTo: "2026-09-30", comparePage: "2" }} comparison={comparison} />);
  const link = container.querySelector<HTMLAnchorElement>("a[download]");
  expect(link).not.toBeNull();
  return { link: link!, csv: decodeURIComponent(link!.getAttribute("href")!.split(",").slice(1).join(",")), text: container.textContent };
}

describe("research evidence download", () => {
  it("downloads only displayed comparison rows with their historical values, scope and coverage", () => {
    const { link, csv, text } = download(evidence(), true);
    expect(link.download).toBe("nettiauto-comparison-historical-page-2.csv");
    expect(text).toContain("This page only: 1 of 40 matching listings");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"listing_price_eur","price_basis"');
    expect(lines[1]).toContain('"Toyota, ""Touring""","Corolla","2020","active","21000","asking"');
    expect(lines[1]).toContain('"historical","2026-09-01","2026-09-30","2","2","40","38","partial"');
    expect(csv).toContain("make=Toyota");
    expect(csv).not.toContain("make=Honda");
    expect(csv).not.toContain("Not exported");
    expect(csv).toContain("not confirmed transaction prices");
  });

  it("keeps missing prices blank and makes formula-like text inert without relying on spreadsheet quote handling", () => {
    const data = evidence();
    data.evidence[0] = { ...data.evidence[0], make: ' \t=HYPERLINK("https://example.invalid")', model: "＋1+1", availability: "sold", askingPriceEur: null, observedSoldPriceEur: 0 };
    const { csv } = download(data);
    expect(csv).toContain('"Text:  \t=HYPERLINK(""https://example.invalid"")"');
    expect(csv).toContain('"Text: ＋1+1"');
    expect(csv).toContain('"sold","","shown_on_sold_listing"');
  });

  it("does not offer a download when there is no displayed evidence", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ResearchEvidence data={{ ...evidence(), evidence: [] }} params={{}} />);
    expect(container.querySelector("a[download]")).toBeNull();
  });
});
