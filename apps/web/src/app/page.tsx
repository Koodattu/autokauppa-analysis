import Link from "next/link";
import { cache, Suspense } from "react";
import {
  ApiError,
  filterMetadataQueryString,
  getAnalyticsSnapshot,
  getAnalyticsTimeSeries,
  getFilterMetadata,
  searchParamsToQueryString,
  singleSearchParam as single,
  type AnalyticsSnapshotResponse,
  type AnalyticsTimeSeriesResponse,
  type FilterMetadata,
} from "@/lib/api";
import { formatCurrency, formatDate, formatKm, formatNumber } from "@/lib/format";
import {
  ChartPlaceholder,
  LazyAnalyticsSnapshotCharts,
  LazyHistoricalPriceChart,
  LazyMarketActivityChart,
} from "./lazy-analytics-charts";
import { MarketFilterForm, type PageSearchParams } from "./market-filter-form";
import { MarketCoverage } from "./market-coverage";
import { SiteHeader } from "./site-header";

type PageProps = {
  searchParams: Promise<PageSearchParams>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const queryString = primaryQueryString(params);
  const comparisonQueryString = buildComparisonQueryString(params);
  const [result, comparisonResult] = await Promise.all([
    loadHomeData(queryString),
    comparisonQueryString ? loadHomeData(comparisonQueryString) : Promise.resolve(null),
  ]);

  if (!result.ok) {
    return <HomeError error={result.error} />;
  }

  const { filters, analytics } = result.data;
  const title = analysisTitle(params);
  const listingsHref = filteredListingsHref(params);
  const timeSeriesPromise = loadTimeSeries(queryString);

  return (
    <main className="shell public-shell">
      <SiteHeader active="analyze" />

      <section className="page-heading analysis-heading">
        <div className="heading-copy">
          <span className="heading-context">Finnish used-car market</span>
          <h1>{title}</h1>
          <p className="heading-meta">
            See typical asking prices, market movement, and listing availability for this exact scope.
          </p>
        </div>
        <Link className="button-link secondary-button" href={listingsHref}>
          Open {formatNumber(analytics.summary.listingCount)} matching listings
        </Link>
      </section>

      <MarketFilterForm
        key={queryString}
        action="/"
        filters={filters}
        params={params}
        variant="analytics"
      />

      <MarketComparison
        params={params}
        primaryTitle={title}
        primaryAnalytics={analytics}
        primaryFilters={filters}
        comparisonResult={comparisonResult}
      />

      <section className="analysis-chapter signal-chapter">
        <AnalyticsSectionHeading
          title="Price direction"
          description="The clearest change across the selected observation window, with sample context and a vehicle-mix caveat."
        />
        <Suspense fallback={<MarketSignalPlaceholder />}>
          <PriceTrendSignalSection timeSeriesPromise={timeSeriesPromise} />
        </Suspense>
      </section>

      <section className="market-snapshot" aria-labelledby="market-snapshot-title">
        <div className="snapshot-intro">
          <h2 id="market-snapshot-title">Market snapshot</h2>
          <p>Typical values across the currently selected listings.</p>
        </div>
        <dl className="snapshot-values">
        <Metric
          label="Listings"
          value={formatNumber(analytics.summary.listingCount)}
          detail={`${formatNumber(analytics.summary.activeCount)} current · ${formatNumber(analytics.summary.soldCount)} observed-sold`}
        />
        <Metric
          label="Median asking price"
          value={formatCurrency(analytics.summary.medianAskingPriceEur)}
          detail={`${formatNumber(analytics.summary.askingPriceSampleSize)} listings with an asking price`}
        />
        <Metric
          label="Median mileage"
          value={formatKm(analytics.summary.medianMileageKm)}
          detail={`${formatNumber(analytics.summary.mileageSampleSize)} listings with mileage data`}
        />
        <Metric
          label="Median observed-sold listing price"
          value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)}
          detail={`${formatNumber(analytics.summary.observedSoldPriceSampleSize)} observations · not a confirmed transaction price`}
        />
        </dl>
      </section>

      <MarketCoverage coverage={analytics.coverage} />

      <section className="analysis-chapter">
        <AnalyticsSectionHeading
          title="Price over time"
          description="Compare median asking prices and prices shown on observed-sold listings across each observed period."
        />
        <Suspense fallback={<ChartPlaceholder title="Price over observed time" />}>
          <HistoricalPriceSection timeSeriesPromise={timeSeriesPromise} />
        </Suspense>
      </section>

      <section className="analysis-chapter">
        <AnalyticsSectionHeading
          title="What shapes the price"
          description="Compare model year and mileage first, then use fuel type and transmission to check whether the pattern still holds."
        />
        <LazyAnalyticsSnapshotCharts analytics={analytics} />
      </section>

      <section className="analysis-chapter">
        <AnalyticsSectionHeading
          title="Listing activity"
          description="Counts show listings captured in complete observation periods—not completed sales or exact point-in-time inventory."
        />
        <Suspense fallback={<ChartPlaceholder title="Listings captured per period" />}>
          <MarketActivitySection timeSeriesPromise={timeSeriesPromise} />
        </Suspense>
      </section>

      <section className="evidence-cta">
        <div>
          <h2>Inspect the evidence behind this view</h2>
          <p>Open the underlying listings to compare individual prices, mileage, sellers, and observation dates.</p>
        </div>
        <Link className="button-link" href={listingsHref}>
          View {formatNumber(analytics.summary.listingCount)} listings
        </Link>
      </section>
    </main>
  );
}

function MarketComparison({
  params,
  primaryTitle,
  primaryAnalytics,
  primaryFilters,
  comparisonResult,
}: {
  params: PageSearchParams;
  primaryTitle: string;
  primaryAnalytics: AnalyticsSnapshotResponse;
  primaryFilters: FilterMetadata;
  comparisonResult: Awaited<ReturnType<typeof loadHomeData>> | null;
}) {
  const compareMake = single(params.compareMake);
  const comparisonOptionsMatch = single(params.compareOptionsForMake) === compareMake;
  const compareModel = comparisonOptionsMatch ? single(params.compareModel) : "";
  const comparisonData = comparisonResult?.ok ? comparisonResult.data : null;
  const comparisonTitle = analysisTitle({
    make: compareMake,
    model: compareModel,
    modelYear: comparisonOptionsMatch ? single(params.compareModelYear) : "",
  });

  return (
    <section className="comparison-section" aria-labelledby="comparison-title">
      <div className="comparison-heading">
        <div>
          <span className="heading-context">Side-by-side scope</span>
          <h2 id="comparison-title">Compare another market segment</h2>
          <p>The availability, price, mileage, seller, and observation-window filters above apply to both sides.</p>
        </div>
        {compareMake ? <Link href={comparisonClearHref(params)}>Clear comparison</Link> : null}
      </div>

      <form className="comparison-form" action="/" method="get">
        {primaryHiddenInputs(params)}
        <input type="hidden" name="compareOptionsForMake" value={compareMake} />
        <FilterSelect label="Comparison make" name="compareMake" value={compareMake} options={primaryFilters.makes} />
        <FilterSelect
          label="Comparison model"
          name="compareModel"
          value={compareModel}
          options={comparisonData?.filters.models ?? []}
          disabled={!compareMake}
        />
        <label>
          <span>Exact model year</span>
          <input
            name="compareModelYear"
            type="number"
            inputMode="numeric"
            min={comparisonData?.filters.yearRange.min ?? 1886}
            max={comparisonData?.filters.yearRange.max ?? 2100}
            defaultValue={comparisonOptionsMatch ? single(params.compareModelYear) : ""}
            disabled={!compareMake}
          />
        </label>
        <FilterSelect
          label="Fuel type"
          name="compareFuelType"
          value={comparisonOptionsMatch ? single(params.compareFuelType) : ""}
          options={comparisonData?.filters.fuelTypes ?? []}
          disabled={!compareMake}
        />
        <button type="submit">{compareMake ? "Update comparison" : "Add comparison"}</button>
      </form>

      {compareMake && !comparisonData ? (
        <p className="comparison-error">Comparison data is unavailable for this scope. Check the comparison values and try again.</p>
      ) : null}
      {comparisonData ? (
        <div className="comparison-results">
          <ComparisonScope title={primaryTitle} analytics={primaryAnalytics} />
          <ComparisonScope title={comparisonTitle} analytics={comparisonData.analytics} />
          <ComparisonDifference
            primary={primaryAnalytics.summary.medianAskingPriceEur}
            comparison={comparisonData.analytics.summary.medianAskingPriceEur}
          />
        </div>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
  disabled = false,
}: {
  label: string;
  name: string;
  value: string;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <select name={name} defaultValue={value} disabled={disabled}>
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ComparisonScope({ title, analytics }: { title: string; analytics: AnalyticsSnapshotResponse }) {
  return (
    <article className="comparison-scope">
      <h3>{title}</h3>
      <dl>
        <Metric label="Listings" value={formatNumber(analytics.summary.listingCount)} detail="matching observed listings" />
        <Metric label="Median asking" value={formatCurrency(analytics.summary.medianAskingPriceEur)} detail={`${formatNumber(analytics.summary.askingPriceSampleSize)} priced listings`} />
        <Metric label="Median mileage" value={formatKm(analytics.summary.medianMileageKm)} detail={`${formatNumber(analytics.summary.mileageSampleSize)} listings with mileage`} />
        <Metric label="Observed-sold price" value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)} detail="listing evidence, not a transaction price" />
      </dl>
    </article>
  );
}

function ComparisonDifference({ primary, comparison }: { primary: number | null; comparison: number | null }) {
  if (primary === null || comparison === null || primary === 0) {
    return <p className="comparison-difference">Both scopes need asking-price evidence before a price difference can be calculated.</p>;
  }
  const difference = comparison - primary;
  const percentage = (difference / primary) * 100;
  const direction = difference === 0 ? "the same as" : difference > 0 ? "higher than" : "lower than";
  return (
    <p className="comparison-difference">
      The comparison scope median asking price is <strong>{formatCurrency(Math.abs(difference))} ({formatNumber(Math.abs(Number(percentage.toFixed(1))))}%) {direction}</strong> the primary scope. This is an unadjusted comparison; vehicle mix can explain the difference.
    </p>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <dt>{label}</dt>
      <dd>
        <span className="metric-value">{value}</span>
        <small>{detail}</small>
      </dd>
    </div>
  );
}

async function loadHomeData(queryString: string): Promise<
  | { ok: true; data: { filters: FilterMetadata; analytics: AnalyticsSnapshotResponse } }
  | { ok: false; error: unknown }
> {
  try {
    const snapshotParams = new URLSearchParams(queryString);
    for (const key of ["from", "to", "interval"]) {
      snapshotParams.delete(key);
    }
    const snapshotQueryString = snapshotParams.toString();
    const query = snapshotQueryString ? `?${snapshotQueryString}` : "";
    const filterQueryString = filterMetadataQueryString(queryString);
    const filterQuery = filterQueryString ? `?${filterQueryString}` : "";
    const [filters, analytics] = await Promise.all([
      getFilterMetadata(filterQuery, { next: { revalidate: 300 } }),
      getAnalyticsSnapshot(query, { next: { revalidate: 60 } }),
    ]);
    return { ok: true, data: { filters, analytics } };
  } catch (error) {
    return { ok: false, error };
  }
}

const loadTimeSeries = cache(async (queryString: string) => {
  const query = queryString ? `?${queryString}` : "";
  return getAnalyticsTimeSeries(query, {
    next: { revalidate: 60 },
  });
});

type TimeSeriesPromise = Promise<AnalyticsTimeSeriesResponse>;

async function PriceTrendSignalSection({ timeSeriesPromise }: { timeSeriesPromise: TimeSeriesPromise }) {
  const timeSeries = await timeSeriesPromise;
  return (
    <PriceTrendInsight
      data={timeSeries.marketOverTime}
      availability={timeSeries.appliedFilters.availability}
    />
  );
}

async function HistoricalPriceSection({ timeSeriesPromise }: { timeSeriesPromise: TimeSeriesPromise }) {
  const timeSeries = await timeSeriesPromise;
  return (
    <LazyHistoricalPriceChart
      data={timeSeries.marketOverTime}
      availability={timeSeries.appliedFilters.availability}
    />
  );
}

async function MarketActivitySection({ timeSeriesPromise }: { timeSeriesPromise: TimeSeriesPromise }) {
  const timeSeries = await timeSeriesPromise;
  return <LazyMarketActivityChart data={timeSeries.marketOverTime} />;
}

function AnalyticsSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="analytics-section-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function PriceTrendInsight({
  data,
  availability,
}: {
  data: AnalyticsTimeSeriesResponse["marketOverTime"];
  availability: AnalyticsTimeSeriesResponse["appliedFilters"]["availability"];
}) {
  const askingPoints = data
    .filter((point) => point.medianAskingPriceEur !== null)
    .map((point) => ({
      point,
      price: point.medianAskingPriceEur as number,
      sampleSize: point.askingPriceSampleSize,
    }));
  const observedSoldPoints = data
    .filter((point) => point.medianObservedSoldPriceEur !== null)
    .map((point) => ({
      point,
      price: point.medianObservedSoldPriceEur as number,
      sampleSize: point.observedSoldPriceSampleSize,
    }));
  const usesObservedSold = availability === "sold" ||
    (availability === "all" && askingPoints.length < 2 && observedSoldPoints.length >= 2);
  const metricLabel = usesObservedSold ? "observed-sold" : "asking";
  const points = [...(usesObservedSold ? observedSoldPoints : askingPoints)]
    .sort((left, right) => left.point.bucket.localeCompare(right.point.bucket));
  if (points.length < 2) {
    const scopeLabel = availability === "sold" ? "sold" : availability === "current" ? "current" : "selected";
    return (
      <aside className="market-signal signal-neutral">
        <span className="signal-symbol" aria-hidden="true">→</span>
        <div>
          <strong>Not enough complete {scopeLabel} periods to show a price direction yet.</strong>
          <p>Two periods with {metricLabel} price evidence are needed. Try a wider observation window.</p>
        </div>
      </aside>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const firstPrice = first.price;
  const lastPrice = last.price;
  if (firstPrice === 0) {
    return null;
  }

  const change = ((lastPrice - firstPrice) / firstPrice) * 100;
  const stable = Math.abs(change) < 0.5;
  const direction = stable ? "broadly flat" : change > 0 ? "higher" : "lower";
  const symbol = stable ? "→" : change > 0 ? "↗" : "↘";

  return (
    <aside className={`market-signal ${stable ? "signal-neutral" : change > 0 ? "signal-up" : "signal-down"}`}>
      <span className="signal-symbol" aria-hidden="true">{symbol}</span>
      <div>
        <strong>
          Median {metricLabel} prices are {stable ? direction : `${formatNumber(Math.abs(Number(change.toFixed(1))))}% ${direction}`} across the observed window.
        </strong>
        <p>
          {formatCurrency(firstPrice)} on {formatDate(first.point.bucket)} to {formatCurrency(lastPrice)} on {formatDate(last.point.bucket)} · latest period includes {formatNumber(last.sampleSize)} {metricLabel} observations. Vehicle mix can change between periods.
        </p>
      </div>
    </aside>
  );
}

function MarketSignalPlaceholder() {
  return (
    <div className="market-signal signal-loading" role="status" aria-busy="true">
      <span className="signal-symbol" aria-hidden="true">·</span>
      <div>
        <strong>Reading price direction…</strong>
        <p>Comparing observed periods in this market scope.</p>
      </div>
    </div>
  );
}

function HomeError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError && error.status === 400
      ? "Check the selected filters and try again."
      : "Market data is temporarily unavailable.";

  return (
    <main className="shell public-shell">
      <SiteHeader active="analyze" />
      <section className="panel error-state page-error">
        <h1>Data unavailable</h1>
        <p>{message}</p>
        <p className="state-guidance">Reset the scope to rule out an invalid combination, or try again shortly.</p>
        <Link className="button-link" href="/">
          Reset market scope
        </Link>
      </section>
    </main>
  );
}

function analysisTitle(params: PageSearchParams) {
  const make = single(params.make);
  const model = single(params.model);
  const modelYear = single(params.modelYear);
  const segment = [make, model].filter(Boolean).join(" ");

  if (segment && modelYear) {
    return `${segment}, model year ${modelYear}`;
  }
  if (segment) {
    return segment;
  }
  if (modelYear) {
    return `Model year ${modelYear}`;
  }
  return "Passenger car market";
}

function filteredListingsHref(params: PageSearchParams) {
  const query = new URLSearchParams(primaryQueryString(params));
  for (const key of ["from", "to", "interval", "page", "pageSize", "sort"]) {
    query.delete(key);
  }
  const value = query.toString();
  return value ? `/listings?${value}` : "/listings";
}

const comparisonKeys = ["compareMake", "compareModel", "compareModelYear", "compareFuelType", "compareOptionsForMake"] as const;

function primaryQueryString(params: PageSearchParams) {
  const query = new URLSearchParams(searchParamsToQueryString(params));
  for (const key of comparisonKeys) {
    query.delete(key);
  }
  return query.toString();
}

function buildComparisonQueryString(params: PageSearchParams) {
  const make = single(params.compareMake);
  if (!make) {
    return "";
  }

  const query = new URLSearchParams(primaryQueryString(params));
  for (const key of ["make", "model", "modelYear", "fuelType"]) {
    query.delete(key);
  }
  query.set("make", make);
  const comparisonOptionsMatch = single(params.compareOptionsForMake) === make;
  for (const [source, target] of [
    ["compareModel", "model"],
    ["compareModelYear", "modelYear"],
    ["compareFuelType", "fuelType"],
  ] as const) {
    const value = comparisonOptionsMatch ? single(params[source]) : "";
    if (value) {
      query.set(target, value);
    }
  }
  return query.toString();
}

function comparisonClearHref(params: PageSearchParams) {
  const query = primaryQueryString(params);
  return query ? `/?${query}` : "/";
}

function primaryHiddenInputs(params: PageSearchParams) {
  return Array.from(new URLSearchParams(primaryQueryString(params))).map(([name, value], index) => (
    <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
  ));
}
