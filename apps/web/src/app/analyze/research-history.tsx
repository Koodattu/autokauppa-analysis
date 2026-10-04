import Link from "next/link";
import type { AnalyticsTimeSeriesResponse } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { selectedFilterLabels } from "@/lib/market-scope";
import { comparisonParams, researchHref } from "@/lib/research-navigation";
import type { WebSearchParams } from "@/lib/url-filter-navigation";
import { LazyHistoricalPriceChart } from "../lazy-analytics-charts";

export function ResearchHistory({ primary, comparison, params }: {
  primary: AnalyticsTimeSeriesResponse;
  comparison: AnalyticsTimeSeriesResponse | null;
  params: WebSearchParams;
}) {
  const groups = [primary, ...(comparison ? [comparison] : [])];
  const prices = groups.flatMap((group) => group.marketOverTime.flatMap((point) =>
    [point.medianAskingPriceEur, point.medianObservedSoldPriceEur].filter((price): price is number => price !== null)));
  let priceDomain: [number, number] | undefined;
  if (comparison && prices.length) {
    const min = Math.min(...prices), max = Math.max(...prices);
    const padding = Math.max((max - min) * 0.05, 100);
    priceDomain = [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }

  return <section className="analysis-chapter" id="research-trend">
    <h2>{comparison ? "Compare price histories" : "Prices over observed time"}</h2>
    <p>Median prices use each group’s vehicle attributes stored at that time. A changing mix of cars can change the median. Missing periods are left as gaps. Observed-sold listing prices are not confirmed transactions.</p>
    {comparison && <p className="research-note">Both charts use the same euro scale. Each keeps its own observation dates and interval; the horizontal positions may represent different dates.</p>}
    <div className={comparison ? "research-history-grid" : undefined}>
      {groups.map((series, index) => {
        const isComparison = index === 1;
        const title = comparison ? `${isComparison ? "Comparison" : "Primary"} group history` : "Price over observed time";
        const scope = selectedFilterLabels(isComparison ? comparisonParams(params) : params, "analytics").join(" · ");
        const interval = { day: "Daily", week: "Weekly", month: "Monthly" }[series.appliedFilters.interval];
        return <section key={index} id={isComparison ? "comparison-history" : "primary-history"} aria-label={title}>
          <LazyHistoricalPriceChart data={series.marketOverTime} availability={series.appliedFilters.availability}
            title={title} context={`${scope}${scope ? " · " : ""}${interval} periods`} priceDomain={priceDomain} />
          {series.marketOverTime.length > 0 && <details className="chart-data"><summary>Explore a particular period</summary>
            <div className="period-links">{series.marketOverTime.map((point) => {
              const query = series.appliedFilters;
              const end = new Date(`${point.bucket}T00:00:00Z`);
              if (query.interval === "month") end.setUTCMonth(end.getUTCMonth() + 1);
              else end.setUTCDate(end.getUTCDate() + (query.interval === "week" ? 7 : 1));
              end.setUTCDate(end.getUTCDate() - 1);
              const from = query.from && query.from > point.bucket ? query.from : point.bucket;
              const to = query.to && query.to < end.toISOString().slice(0, 10) ? query.to : end.toISOString().slice(0, 10);
              return <Link key={point.bucket} href={`${researchHref(params, { from, to, activity: undefined }, isComparison)}#${isComparison ? "comparison" : "primary"}-research`}>
                {from} · {formatCurrency(query.availability === "sold" ? point.medianObservedSoldPriceEur : point.medianAskingPriceEur)}
              </Link>;
            })}</div>
          </details>}
        </section>;
      })}
    </div>
  </section>;
}
