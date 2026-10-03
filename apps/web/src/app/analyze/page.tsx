import Link from "next/link";
import { getFilterMetadata, getPriceResearch, getAnalyticsTimeSeries, ApiError } from "@/lib/server-api";
import { listingSearchUrlFilter } from "@nettiauto/schemas";
import { cloneComparisonHref, comparisonParams, researchHref, researchQuery, swapResearchHref } from "@/lib/research-navigation";
import { SiteHeader } from "../site-header";
import { MarketFilterForm, type PageSearchParams } from "../market-filter-form";
import { SaveSearch } from "../saved-workspace";
import { LazyHistoricalPriceChart } from "../lazy-analytics-charts";
import { ResearchSummary, ResearchExploration, ResearchEvidence } from "./research-results";
import { formatCurrency, formatNumber } from "@/lib/format";
import { RetryButton } from "../retry-button";

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  const params: PageSearchParams = { availability: "current", ...await searchParams };
  const primary = researchQuery(params);
  const comparison = (params.comparing === "1" || typeof params.compareMake === "string") ? researchQuery(params, true) : null;
  if (!primary.ok || (comparison && !comparison.ok)) return <main className="shell public-shell"><SiteHeader active="analyze" /><section className="panel"><h1>Check the research filters</h1><p>Use valid dates and ranges. Each observation window can span up to two years; compare separate windows for more distant years.</p><Link href="/analyze">Reset research</Link></section></main>;
  const query = listingSearchUrlFilter.format(primary.query).toString();
  let data;
  try {
    data = await Promise.all([
      getFilterMetadata(`?${new URLSearchParams({ ...(primary.query.make ? { make: primary.query.make } : {}) })}`),
      getPriceResearch(`?${query}`), getAnalyticsTimeSeries(`?${query}`),
      comparison?.ok ? getPriceResearch(`?${listingSearchUrlFilter.format(comparison.query)}`) : Promise.resolve(null),
      comparison?.ok ? getFilterMetadata(`?${new URLSearchParams({ ...(comparison.query.make ? { make: comparison.query.make } : {}) })}`) : Promise.resolve(null),
    ]);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return <main className="shell public-shell"><SiteHeader active="analyze" /><section className="panel"><h1>Research is temporarily unavailable</h1><p>Your filters are kept in the address. Try again shortly.</p><RetryButton /></section></main>;
  }
  const [filters, research, series, compared, compareFilters] = data;
  const title = [primary.query.make, primary.query.model, primary.query.modelYear].filter(Boolean).join(" ") || "Car";
  const sameVehicleFilters = comparison?.ok && ["make", "model", "modelYear", "modelYearFrom", "modelYearTo", "mileageMin", "mileageMax", "fuelType", "transmission", "bodyType", "sellerType", "availability", "priceMin", "priceMax", "activity"].every((key) => primary.query[key as keyof typeof primary.query] === comparison.query[key as keyof typeof comparison.query]);
  const delta = compared?.summary.median !== null && compared?.summary.median !== undefined && research.summary.median !== null ? compared.summary.median - research.summary.median : null;
  const clearComparison = Object.fromEntries(Object.entries(params).filter(([key]) => !key.startsWith("compar")));
  return <main className="shell public-shell"><SiteHeader active="analyze" />
    <section className="page-heading"><div className="heading-copy"><h1>{title} price research</h1><p>Explore observed prices, then change the cars or dates to answer your question.</p></div></section>
    <div className="research-toolbar">
      <nav aria-label="Research sections"><a href="#research-trend">Price history</a><a href="#research-exploration">Price factors</a><a href="#research-evidence">Listing evidence</a></nav>
      {!compared && <Link className="button-link secondary-button" href={`${cloneComparisonHref(params)}#comparison-research`}>Compare cars or periods</Link>}
    </div>
    <div className={compared ? "period-comparison" : ""}>
      <ResearchSummary data={research} params={params} id="primary-research" title={compared ? "Primary group" : "Selected prices"}>
        <details className="research-editor" key={`primary-${query}`}><summary>Change primary cars or dates</summary>
          <MarketFilterForm action="/analyze" variant="analytics" filters={filters} params={params} resultAnchor="primary-research" />
        </details>
      </ResearchSummary>
      {compared && comparison?.ok && compareFilters && <ResearchSummary data={compared} params={comparisonParams(params)} id="comparison-research" title="Comparison group">
        <details className="research-editor" key={`comparison-${listingSearchUrlFilter.format(comparison.query)}`}><summary>Change comparison cars or dates</summary>
          <MarketFilterForm action="/analyze" variant="analytics" filters={compareFilters} params={comparisonParams(params)} comparisonBase={new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString()} resultAnchor="comparison-research" />
        </details>
      </ResearchSummary>}
    </div>
    {compared && <section className="panel comparison-section"><p>{sameVehicleFilters ? "The vehicle filters match on both sides." : "The groups use different vehicle filters."} These are group medians; the individual cars can differ between periods.</p>
      {delta !== null && research.summary.count >= 5 && compared.summary.count >= 5 && research.summary.median! > 0 ? <p className="comparison-difference">Comparison median: <strong>{formatCurrency(Math.abs(delta))} ({formatNumber(Number((Math.abs(delta) / research.summary.median! * 100).toFixed(1)))}%) {delta > 0 ? "higher" : delta < 0 ? "lower" : "unchanged"}</strong>. This does not measure depreciation of the same vehicles.</p> : <p>At least five priced listings on each side are needed to summarize the difference.</p>}
      <div className="research-actions"><Link href={swapResearchHref(params)}>Swap groups</Link><Link href={researchHref(clearComparison, { page: primary.query.page })}>Remove comparison</Link><a href="#comparison-evidence">Comparison listing evidence</a></div>
    </section>}
    <details className="research-save"><summary>Save or share this research</summary><SaveSearch href={researchHref(params, { page: primary.query.page })} title={`${title} price research`} /></details>
    {(primary.query.priceMin !== undefined || primary.query.priceMax !== undefined) && <p className="research-note">A price filter changes the reference distribution. <Link href={researchHref(params, { priceMin: undefined, priceMax: undefined })}>Study this group without a price limit</Link>.</p>}
    <section className="analysis-chapter" id="research-trend"><h2>{compared ? "Primary group price history" : "Prices over observed time"}</h2><p>Each point applies the primary vehicle filters to the attributes stored at that time. A changing mix of cars can change the median. Missing periods are left as gaps.</p><LazyHistoricalPriceChart data={series.marketOverTime} availability={primary.query.availability} />
      <details className="chart-data"><summary>Explore a particular period</summary><div className="period-links">{series.marketOverTime.map((point) => {
        const start = new Date(`${point.bucket}T00:00:00Z`); const end = new Date(start);
        if (primary.query.interval === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + (primary.query.interval === "week" ? 7 : 1));
        end.setUTCDate(end.getUTCDate() - 1);
        const from = primary.query.from && primary.query.from > point.bucket ? primary.query.from : point.bucket;
        const to = primary.query.to && primary.query.to < end.toISOString().slice(0, 10) ? primary.query.to : end.toISOString().slice(0, 10);
        return <Link key={point.bucket} href={researchHref(params, { from, to, activity: undefined })}>{from} · {formatCurrency(primary.query.availability === "sold" ? point.medianObservedSoldPriceEur : point.medianAskingPriceEur)}</Link>;
      })}</div></details>
    </section>
    <ResearchExploration data={research} params={params} />
    <ResearchEvidence data={research} params={params} />
    {compared && <ResearchEvidence data={compared} params={params} comparison />}
  </main>;
}
