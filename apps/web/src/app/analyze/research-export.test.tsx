// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResearchResponse } from "@nettiauto/schemas";
import { ResearchEvidence, ResearchExploration, ResearchSummary } from "./research-results";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

describe("research results and evidence download", () => {
  it("labels price bands with the exact inclusive filter bounds, keeping the final band open", () => {
    const data = evidence();
    data.priceBands = [{ from: 8000, to: 12000, count: 4 }, { from: 12000, to: null, count: 34 }];
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ResearchExploration data={data} params={{ from: "2026-09-01", sort: "priceAsc", page: "2" }} />);
    const links = [...container.querySelectorAll<HTMLAnchorElement>(".distribution-bars a")];
    expect(links[0].querySelector("span")?.textContent).toBe("8\u00a0000 €–11\u00a0999 €");
    const bounded = new URL(links[0].href);
    expect(bounded.searchParams.get("priceMin")).toBe("8000");
    expect(bounded.searchParams.get("priceMax")).toBe("11999");
    expect(bounded.searchParams.get("from")).toBe("2026-09-01");
    expect(bounded.searchParams.get("sort")).toBe("priceAsc");
    expect(bounded.searchParams.has("page")).toBe(false);
    expect(links[1].querySelector("span")?.textContent).toBe("12\u00a0000 €+");
    expect(new URL(links[1].href).searchParams.has("priceMax")).toBe(false);
  });

  it.each([false, true])("offers scoped ordering beside the evidence (comparison: %s)", (comparison) => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ResearchEvidence data={evidence()} params={{
      make: "Honda", page: "2", sort: "priceAsc", comparing: "1", compareMake: "Toyota",
      compareFrom: "2026-09-01", comparePage: "3", compareSort: "mileageAsc",
    }} comparison={comparison} />);
    const form = container.querySelector<HTMLFormElement>("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("aria-label")).toBe(comparison ? "Comparison evidence order" : "Primary evidence order");
    expect(form!.getAttribute("action")).toBe(`/analyze#${comparison ? "comparison" : "research"}-evidence`);
    const select = form!.querySelector("select")!;
    expect(select.name).toBe(comparison ? "compareSort" : "sort");
    expect(select.value).toBe(comparison ? "mileageAsc" : "priceAsc");
    expect([...select.options].map((option) => option.value)).not.toContain("priceReductionDesc");
    expect(new FormData(form!).get(comparison ? "comparePage" : "page")).toBeNull();
    expect(new FormData(form!).get(comparison ? "page" : "comparePage")).toBe(comparison ? "2" : "3");
  });

  it("explains a current scope with no priced matches without inventing observation dates or ranges", () => {
    const data = evidence();
    data.mode = "current";
    data.observedFrom = null; data.observedTo = null;
    data.summary = { count: 0, median: null, p25: null, p75: null, medianMileage: null, medianYear: null };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ResearchSummary data={data} title="Selected prices" params={{ priceMax: "1" }} id="primary-research" />);
    expect(container.textContent).toContain("No priced listings match these filters");
    expect(container.textContent).not.toContain("last observed –");
    expect(container.textContent).not.toContain("–––");
  });

  it.each([false, true])("keeps listing returns and page changes at their research evidence (comparison: %s)", (comparison) => {
    const params = { make: "Honda", page: "2", comparing: "1", compareMake: "Toyota", compareFrom: "2026-09-01", comparePage: "2" };
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ResearchEvidence data={evidence()} params={params} comparison={comparison} />);
    const anchor = comparison ? "#comparison-evidence" : "#research-evidence";
    const listing = container.querySelector<HTMLAnchorElement>('a[href^="/listings/"]')!;
    const returnTo = new URL(listing.href).searchParams.get("returnTo")!;
    expect(returnTo).toBe(`/analyze?${new URLSearchParams(params)}${anchor}`);
    expect(listing.target).toBe("_blank");
    const previous = container.querySelector<HTMLAnchorElement>(".pagination a")!;
    expect(previous.hash).toBe(anchor);
    expect(new URL(previous.href).searchParams.get(comparison ? "comparePage" : "page")).toBe("1");
    expect(new URL(previous.href).searchParams.get(comparison ? "page" : "comparePage")).toBe("2");
  });

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
