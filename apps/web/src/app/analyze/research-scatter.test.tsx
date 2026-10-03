// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResearchResponse } from "@nettiauto/schemas";
import { PriceMileagePlot } from "./research-scatter";

describe("research point labels", () => {
  it("renders complete text titles on the server for priced points with and without a model year", () => {
    const html = renderToStaticMarkup(<PriceMileagePlot data={researchData()} />);
    expect([...html.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1])).toEqual([
      "10\u00a0000 € · 50\u00a0000 km · 2020",
      "20\u00a0000 € · 100\u00a0000 km · Year unknown",
    ]);
  });

  it("uses the selected period's values and hides a selection outside the new filtered sample", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const data = researchData();
    try {
      await act(async () => { root.render(<PriceMileagePlot data={data} />); });
      await act(async () => { container.querySelector("circle")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(container.querySelector(".research-note")?.textContent).toContain("10\u00a0000 €");

      const earlier = { ...data, mode: "historical" as const, points: [{ ...data.points[0], price: 11000 }, data.points[1]] };
      await act(async () => { root.render(<PriceMileagePlot data={earlier} />); });
      expect(container.querySelector(".research-note")?.textContent).toContain("11\u00a0000 €");
      expect(container.querySelector(".research-note")?.textContent).not.toContain("10\u00a0000 €");

      await act(async () => { root.render(<PriceMileagePlot data={{ ...data, points: [data.points[1]] }} />); });
      expect(container.querySelector(".research-note")).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});

function researchData(): ResearchResponse {
  return {
      mode: "current",
      coverage: { lastRelevantCrawlAt: null, sampleSize: 2, includesCurrent: true,
        includesSold: false, dataSource: "search_result_data", completeness: "complete" },
      observedFrom: null, observedTo: null, historyFrom: null, historyTo: null,
      summary: { count: 2, median: 15000, p25: 12500, p75: 17500, medianMileage: 75000, medianYear: 2020 },
      fields: { mileage: 2, year: 1, fuel: 0, transmission: 0, body: 0 },
      priceBands: [], yearMileage: [], fuels: [], transmissions: [], bodies: [], models: [], evidence: [],
      evidencePage: 1, evidencePages: 1,
      points: [
        { listingId: "00000000-0000-4000-8000-000000000001", price: 10000, mileage: 50000, year: 2020 },
        { listingId: "00000000-0000-4000-8000-000000000002", price: 20000, mileage: 100000, year: null },
      ],
  };
}
