import Link from "next/link";
import type { ReactNode } from "react";
import type { ResearchResponse } from "@/lib/api";
import { formatCurrency, formatListingPrice, formatPriceBand, formatDate, formatDateTime, formatKm, formatNumber } from "@/lib/format";
import { comparisonParams, researchHref, researchListingHref } from "@/lib/research-navigation";
import { selectedFilterLabels } from "@/lib/market-scope";
import type { WebSearchParams } from "@/lib/url-filter-navigation";
import { PriceMileagePlot } from "./research-scatter";
import { SaveCar } from "../saved-workspace";
import { researchEvidenceCsv } from "@/lib/research-export";
import { ResultSort } from "../result-sort";

export function ResearchSummary({ data, title, params, children, id }: { data: ResearchResponse; title: string; params: WebSearchParams; children?: ReactNode; id: string }) {
  const observationLabel = data.mode === "historical" ? "Historical evidence" : "Latest stored listings";
  const observationDates = !data.observedTo ? "" : data.mode === "historical"
    ? ` · collections completed ${formatDate(data.observedFrom)}–${formatDate(data.observedTo)}`
    : ` · last observed ${formatDateTime(data.observedTo)}`;
  return <section className="panel research-summary" id={id} tabIndex={-1} aria-label={title}><h2>{title}</h2>
    <p className="research-scope">{selectedFilterLabels(params, "analytics").join(" · ") || "All passenger cars · Current listings"}</p>
    <p>{observationLabel}{observationDates}</p>
    {data.mode === "historical" && !data.observedTo ? <p className="research-note">No complete observations in this period. Available collection history: {formatDate(data.historyFrom)}–{formatDate(data.historyTo)}. Earlier prices are not estimated.</p> : <dl className="research-metrics">
      <div><dt>Median listing price</dt><dd>{formatCurrency(data.summary.median)}</dd></div>
      <div><dt>Middle 50%</dt><dd>{data.summary.p25 === null || data.summary.p75 === null ? "–" : `${formatCurrency(data.summary.p25)}–${formatCurrency(data.summary.p75)}`}</dd></div>
      <div><dt>Priced listings</dt><dd>{formatNumber(data.summary.count)}</dd></div>
      <div><dt>Median mileage</dt><dd>{formatKm(data.summary.medianMileage)}</dd></div>
      <div><dt>Median model year</dt><dd>{data.summary.medianYear ?? "–"}</dd></div>
    </dl>}
    {data.summary.count < 5 && (data.mode === "current" || data.observedTo) && <p className="research-note">{data.summary.count ? "Very few comparable prices. Use the individual listings as evidence." : "No priced listings match these filters. Change the cars or dates below."}</p>}
    {data.coverage.includesCurrent && data.coverage.includesSold && <p className="research-note">This view combines asking prices and prices shown on sold listings. Select one availability for a consistent price basis.</p>}
    {data.coverage.completeness === "partial" && <p className="research-note">Only part of the requested availability was observed in this period.</p>}
    <details className="chart-data"><summary>Coverage and interpretation</summary><p>{formatNumber(data.coverage.sampleSize)} matching listings. Known mileage: {formatNumber(data.fields.mileage)}; model year: {formatNumber(data.fields.year)}; fuel: {formatNumber(data.fields.fuel)}; transmission: {formatNumber(data.fields.transmission)}; body style: {formatNumber(data.fields.body)}.</p>
      <p>Missing features can make filtered samples unrepresentative. Prices are listing evidence, not transaction prices. Historical values use stored snapshots; older records may include later enrichment. Model year is not a verified manufacture date.</p>
    </details>
    {children}
  </section>;
}

export function ResearchExploration({ data, params }: { data: ResearchResponse; params: WebSearchParams }) {
  const maxBand = Math.max(1, ...data.priceBands.map((band) => band.count));
  const groups = [["Fuel", "fuelType", data.fuels], ["Transmission", "transmission", data.transmissions], ["Body style", "bodyType", data.bodies]] as const;
  return <section className="analysis-chapter" id="research-exploration"><h2>What shapes the price?</h2><p>Select a price band or vehicle group to inspect its distribution and recorded listings. Counts and ranges describe this selected period.</p>
    <div className="analytics-grid"><section className="chart-panel"><h3>Price distribution</h3><div className="distribution-bars">{data.priceBands.map((band) => <Link key={band.from} href={researchHref(params, { priceMin: band.from, priceMax: band.to === null ? undefined : band.to - 1 })}>
      <span>{formatPriceBand(band.from, band.to)}</span><span className="distribution-track"><span style={{ width: `${band.count / maxBand * 100}%` }} /></span><strong>{formatNumber(band.count)}</strong>
    </Link>)}{!data.priceBands.length && <p>No priced listings in this scope.</p>}</div></section>
    <section className="chart-panel"><h3>Price versus mileage</h3><PriceMileagePlot data={data} params={params} /></section></div>
    <div className="research-feature-grid">{groups.map(([title, key, rows]) => <section className="panel" key={key}><h3>{title}</h3><p>Median and middle 50% of priced listings. Other vehicle differences may explain the gap.</p><ul className="feature-groups">{rows.map((row) => <li key={row.label}><Link href={researchHref(params, { [key]: row.label })}>{row.label}</Link><strong>{formatCurrency(row.median)}</strong><small>{formatCurrency(row.p25)}–{formatCurrency(row.p75)} · {row.count} prices{row.count < 5 ? " · small sample" : ""}<br />Median model year {row.medianYear ?? "unknown"} · {formatKm(row.medianMileage)}</small></li>)}</ul>{!rows.length && <p>No known {title.toLowerCase()} with prices in this scope.</p>}</section>)}</div>
    <section className="panel"><h3>Model year and mileage together</h3><p>Each cell groups one model year and 25,000 km. Select a group to inspect the cars behind it. This compares different cars, not depreciation of the same car.</p><details className="chart-data"><summary>Explore {data.yearMileage.length} year and mileage groups</summary><div className="chart-table-wrap"><table className="chart-table"><thead><tr><th scope="col">Model year</th><th scope="col">Mileage</th><th scope="col">Median price</th><th scope="col">Middle 50%</th><th scope="col">Prices</th></tr></thead><tbody>{data.yearMileage.map((row) => <tr key={`${row.year}-${row.mileageFrom}`}><td>{row.year}</td><td><Link href={researchHref(params, { modelYear: row.year, modelYearFrom: undefined, modelYearTo: undefined, mileageMin: row.mileageFrom, mileageMax: Math.min(2000000, row.mileageFrom + 24999) })}>{formatKm(row.mileageFrom)}–{formatKm(row.mileageFrom + 24999)}</Link></td><td>{formatCurrency(row.median)}</td><td>{formatCurrency(row.p25)}–{formatCurrency(row.p75)}</td><td>{row.count}{row.count < 5 ? " · small sample" : ""}</td></tr>)}</tbody></table></div></details></section>
  </section>;
}

export function ResearchEvidence({ data, params, comparison = false }: { data: ResearchResponse; params: WebSearchParams; comparison?: boolean }) {
  const evidenceId = comparison ? "comparison-evidence" : "research-evidence";
  const href = researchHref(params, { page: data.evidencePage }, comparison);
  return <section className="panel research-evidence" id={evidenceId} tabIndex={-1}><h2>{comparison ? "Comparison" : "Primary"} listing evidence</h2><p>{data.mode === "historical" ? "These prices and attributes are from the selected historical observations. Listing links open the latest details separately." : "The latest observed listings behind this view."}</p>
    {data.coverage.sampleSize > 0 && <div className="evidence-toolbar">
      <ResultSort key={href} href={href} scope={comparison ? "comparison" : "primary"} />
      {data.evidence.length > 0 && <a className="button-link secondary-button" download={`nettiauto-${comparison ? "comparison" : "primary"}-${data.mode}-page-${data.evidencePage}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(researchEvidenceCsv(data, params, comparison))}`}>Download this page (CSV)</a>}
    </div>}
    {data.evidence.length > 0 && <p className="muted evidence-scope">This page only: {formatNumber(data.evidence.length)} of {formatNumber(data.coverage.sampleSize)} matching listings. Includes filters, observation dates and price basis.</p>}
    {data.evidence.length > 0 && <p className="muted evidence-scope evidence-scroll-hint">Scroll sideways to see all columns.</p>}
    <div className="chart-table-wrap" role="region" aria-label={`${comparison ? "Comparison" : "Primary"} listing evidence table`} tabIndex={0}><table className="chart-table"><thead><tr><th scope="col">Car</th><th scope="col">Price</th><th scope="col">Mileage</th><th scope="col">Features</th><th scope="col">Observed</th><th scope="col">Save / compare</th></tr></thead><tbody>{data.evidence.map((car) => <tr key={car.listingId}><td><Link href={researchListingHref(car.listingId, params, comparison)} target={data.mode === "historical" ? "_blank" : undefined}>{car.make} {car.model} {car.yearModel}{data.mode === "historical" ? " · latest details ↗" : ""}</Link></td><td>{formatListingPrice(car.askingPriceEur ?? car.observedSoldPriceEur)}<small>{car.availability === "sold" ? "Shown on sold listing" : "Asking"}</small></td><td>{formatKm(car.mileageKm)}</td><td>{[car.fuelType, car.transmission, car.bodyType].filter(Boolean).join(" · ") || "Not recorded"}</td><td>{formatDate(car.lastSeenAt)}</td><td>{data.mode === "current" ? <SaveCar id={car.listingId} title={`${car.make} ${car.model} ${car.yearModel}`} /> : "Historical observation"}</td></tr>)}</tbody></table></div>
    {!data.evidence.length && (data.evidencePage > data.evidencePages
      ? <p>This evidence page is no longer available. <Link href={`${researchHref(params, { page: 1 }, comparison)}#${evidenceId}`}>Return to the first evidence page</Link>.</p>
      : <p>No listings recorded for these filters and dates.</p>)}
    <nav className="pagination" aria-label={comparison ? "Comparison evidence pages" : "Evidence pages"}>{data.evidencePage > 1 && <Link href={`${researchHref(params, { page: data.evidencePage - 1 }, comparison)}#${evidenceId}`}>Previous</Link>}<span>Page {data.evidencePage} of {data.evidencePages}</span>{data.evidencePage < Math.min(data.evidencePages, 1000) && <Link href={`${researchHref(params, { page: data.evidencePage + 1 }, comparison)}#${evidenceId}`}>Next</Link>}</nav>
    {data.evidencePages > 1000 && <p>Narrow the vehicle filters to inspect results beyond the first 25,000 listings. Summaries include the full matching sample.</p>}
    {comparison && <Link href={researchHref(comparisonParams(params))}>Explore this comparison as the primary group</Link>}
  </section>;
}
