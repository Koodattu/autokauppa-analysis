// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MarketCoverage } from "./market-coverage";

it.each(["complete", "partial", "unknown"] as const)("keeps %s coverage truthful in the compact result view", (completeness) => {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<MarketCoverage compact coverage={{ completeness, sampleSize: 48,
    lastRelevantCrawlAt: "2026-10-02T10:00:00Z", includesCurrent: true, includesSold: false, dataSource: "search_result_data" }} />);
  const details = container.querySelector("details")!;
  expect(details.open).toBe(completeness !== "complete");
  expect(details.querySelector("summary")?.textContent).toContain({ complete: "Collection complete", partial: "Partial", unknown: "Unconfirmed" }[completeness]);
  expect(details.textContent).toContain("48 listings");
  if (completeness === "partial") expect(details.textContent).toContain("Some observations are missing");
  if (completeness === "unknown") expect(details.textContent).toContain("Coverage could not be confirmed");
});
