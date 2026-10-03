import { listingSearchUrlFilter, type ResearchResponse } from "@nettiauto/schemas";
import { researchQuery } from "./research-navigation";
import type { WebSearchParams } from "./url-filter-navigation";

// Export the rendered evidence, never refetch or silently expand its scope.
export function researchEvidenceCsv(data: ResearchResponse, params: WebSearchParams, comparison: boolean) {
  const query = researchQuery(params, comparison);
  const scope = query.ok ? `/analyze?${listingSearchUrlFilter.format({ ...query.query, page: data.evidencePage })}` : "/analyze";
  const rows: Array<Array<string | number | null | undefined>> = [[
    "source_listing_id", "make", "model", "model_year", "availability", "listing_price_eur", "price_basis",
    "mileage_km", "fuel", "transmission", "body_style", "listing_observed_at", "listing_path",
    "research_mode", "observed_from", "observed_through", "evidence_page", "evidence_pages",
    "matching_listings", "priced_listings", "coverage", "research_path", "source", "interpretation",
  ]];
  for (const car of data.evidence) {
    const price = car.availability === "sold" ? car.observedSoldPriceEur : car.askingPriceEur;
    rows.push([
      car.sourceListingId, car.make, car.model, car.yearModel, car.availability, price !== null && price > 0 ? price : null,
      car.availability === "sold" ? "shown_on_sold_listing" : "asking",
      car.mileageKm, car.fuelType, car.transmission, car.bodyType, car.lastSeenAt, `/listings/${car.listingId}`,
      data.mode, data.observedFrom, data.observedTo, data.evidencePage, data.evidencePages,
      data.coverage.sampleSize, data.summary.count, data.coverage.completeness, scope, "Nettiauto",
      "Listing evidence, not confirmed transaction prices. This evidence page only. Historical attributes may include later enrichment. Listing paths open latest details.",
    ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");
  // A visible text prefix also survives spreadsheet save/reopen cycles that strip apostrophes.
  if (typeof value === "string" && (/^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text))) text = `Text: ${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
