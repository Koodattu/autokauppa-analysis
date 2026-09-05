import Link from "next/link";
import { getFilterMetadata, getPriceResearch, getAnalyticsTimeSeries, ApiError } from "@/lib/api";
import { listingSearchUrlFilter } from "@nettiauto/schemas";
import { cloneComparisonHref, comparisonParams, researchHref, researchQuery } from "@/lib/research-navigation";
import { SiteHeader } from "../site-header";
import { MarketFilterForm, type PageSearchParams } from "../market-filter-form";
import { SaveSearch } from "../saved-workspace";
import { LazyHistoricalPriceChart } from "../lazy-analytics-charts";
import { ResearchSummary, ResearchExploration, ResearchEvidence } from "./research-results";
import { formatCurrency, formatNumber } from "@/lib/format";

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
    return <main className="shell public-shell"><SiteHeader active="analyze" /><section className="panel"><h1>Research is temporarily unavailable</h1><p>Your filters are kept in the address. Try again shortly.</p><Link href={researchHref(params)}>Try again</Link></section></main>;
  }
  const [filters, research, series, compared, compareFilters] = data;
  const title = [primary.query.make, primary.query.model, primary.query.modelYear].filter(Boolean).join(" ") || "Car prices";
  const sameVehicleFilters = comparison?.ok && ["make", "model", "modelYear", "modelYearFrom", "modelYearTo", "mileageMin", "mileageMax", "fuelType", "transmission", "bodyType", "sellerType", "availability", "priceMin", "priceMax", "activity"].every((key) => primary.query[key as keyof typeof primary.query] === comparison.query[key as keyof typeof comparison.query]);
  const delta = compared?.summary.median !== null && compared?.summary.median !== undefined && research.summary.median !== null ? compared.summary.median - research.summary.median : null;
  const clearComparison = Object.fromEntries(Object.entries(params).filter(([key]) => !key.startsWith("compar")));
  return <main className="shell public-shell"><SiteHeader active="analyze" />
    <section className="page-heading"><div className="heading-copy"><span className="heading-context">Price research</span><h1>{title}</h1><p>Explore how asking prices vary with model year, mileage and features, today or in an observed period.</p></div><a className="button-link secondary-button" href="#research-evidence">Inspect the listings</a></section>
    <MarketFilterForm action="/analyze" variant="analytics" filters={filters} params={params} key={query} />
    <p className="research-guide">Model year describes the car. Observation dates describe when its price was captured. Leave dates empty for the latest stored listings. Historical periods use the last complete collection for each search within that window, not an annual average.</p>
    <div className="research-actions"><Link className="button-link secondary-button" href={cloneComparisonHref(params)}>Compare this group in another period</Link><Link href={cloneComparisonHref(params)}>Compare a different group of cars</Link></div>
    <div className={compared ? "period-comparison" : ""}><ResearchSummary data={research} title={compared ? "Primary group / period" : "Selected prices"} />{compared && <ResearchSummary data={compared} title="Comparison group / period" />}</div>
    {compared && <section className="panel comparison-section"><p>{sameVehicleFilters ? "The vehicle filters match on both sides." : "The groups use different vehicle filters."} These are group medians; the individual cars can differ between periods.</p>
      {delta !== null && research.summary.count >= 5 && compared.summary.count >= 5 && research.summary.median! > 0 ? <p className="comparison-difference">Comparison median: <strong>{formatCurrency(Math.abs(delta))} ({formatNumber(Number((Math.abs(delta) / research.summary.median! * 100).toFixed(1)))}%) {delta > 0 ? "higher" : delta < 0 ? "lower" : "unchanged"}</strong>. This does not measure depreciation of the same vehicles.</p> : <p>At least five priced listings on each side are needed to summarize the difference.</p>}
      <Link href={researchHref(clearComparison)}>Remove comparison</Link>
    </section>}
    {comparison?.ok && compareFilters && <MarketFilterForm action="/analyze" variant="analytics" filters={compareFilters} params={comparisonParams(params)} comparisonBase={new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString()} key={`compare-${listingSearchUrlFilter.format(comparison.query)}`} />}
    {(primary.query.priceMin !== undefined || primary.query.priceMax !== undefined) && <p className="research-note">A price filter changes the reference distribution. <Link href={researchHref(params, { priceMin: undefined, priceMax: undefined })}>Study this group without a price limit</Link>.</p>}
    <section className="analysis-chapter"><h2>Asking prices over observed time</h2><p>Each point applies these vehicle filters to the attributes stored at that time. A changing mix of cars can change the median.</p><LazyHistoricalPriceChart data={series.marketOverTime} availability={primary.query.availability} />
      <details className="chart-data"><summary>Explore a particular period</summary><div className="period-links">{series.marketOverTime.map((point) => {
        const start = new Date(`${point.bucket}T00:00:00Z`); const end = new Date(start);
        if (primary.query.interval === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCDate(end.getUTCDate() + (primary.query.interval === "week" ? 7 : 1));
        end.setUTCDate(end.getUTCDate() - 1);
        const from = primary.query.from && primary.query.from > point.bucket ? primary.query.from : point.bucket;
        const to = primary.query.to && primary.query.to < end.toISOString().slice(0, 10) ? primary.query.to : end.toISOString().slice(0, 10);
        return <Link key={point.bucket} href={researchHref(params, { from, to, activity: undefined })}>{from} · {formatCurrency(point.medianAskingPriceEur)}</Link>;
      })}</div></details>
    </section>
    <ResearchExploration data={research} params={params} />
    <ResearchEvidence data={research} params={params} />
    {compared && <ResearchEvidence data={compared} params={comparisonParams(params)} comparison />}
    <SaveSearch href={researchHref(params, { page: primary.query.page })} title={`${title} price research`} />
  </main>;
}
