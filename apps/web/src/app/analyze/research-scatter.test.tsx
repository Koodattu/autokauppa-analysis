import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ResearchResponse } from "@nettiauto/schemas";
import { PriceMileagePlot } from "./research-scatter";

describe("research point labels", () => {
  it("renders complete text titles on the server for priced points with and without a model year", () => {
    const data: ResearchResponse = {
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
    const html = renderToStaticMarkup(<PriceMileagePlot data={data} />);
    expect([...html.matchAll(/<title>(.*?)<\/title>/g)].map((match) => match[1])).toEqual([
      "10\u00a0000 € · 50\u00a0000 km · 2020",
      "20\u00a0000 € · 100\u00a0000 km · Year unknown",
    ]);
  });
});
