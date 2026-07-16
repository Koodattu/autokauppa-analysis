import Link from "next/link";
import { cache, Suspense } from "react";
import {
  ApiError,
  apiGet,
  filterMetadataQueryString,
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
  const result = await loadHomeData(searchParamsToQueryString(params));

  if (!result.ok) {
    return <HomeError error={result.error} />;
  }

  const { filters, analytics } = result.data;
  const title = analysisTitle(params);
  const listingsHref = filteredListingsHref(params);

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
        key={searchParamsToQueryString(params)}
        action="/"
        filters={filters}
        params={params}
        variant="analytics"
      />

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
          title="Price direction"
          description="Read the market’s direction across observed periods. This is segment evidence, not a valuation for one car."
        />
        <Suspense fallback={<ChartPlaceholder title="Price over observed time" />}>
          <HistoricalPriceSection queryString={searchParamsToQueryString(params)} />
        </Suspense>
      </section>

      <section className="analysis-chapter">
        <AnalyticsSectionHeading
          title="What shapes the price"
          description="Compare model year and mileage first, then use transmission to check whether the pattern still holds."
        />
        <LazyAnalyticsSnapshotCharts analytics={analytics} />
      </section>

      <section className="analysis-chapter">
        <AnalyticsSectionHeading
          title="Listing activity"
          description="Counts show listings captured in complete observation periods—not completed sales or exact point-in-time inventory."
        />
        <Suspense fallback={<ChartPlaceholder title="Listings captured per period" />}>
          <MarketActivitySection queryString={searchParamsToQueryString(params)} />
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
      apiGet<FilterMetadata>(`/filters${filterQuery}`, { next: { revalidate: 300 } }),
      apiGet<AnalyticsSnapshotResponse>(`/analytics/snapshot${query}`, { next: { revalidate: 60 } }),
    ]);
    return { ok: true, data: { filters, analytics } };
  } catch (error) {
    return { ok: false, error };
  }
}

const loadTimeSeries = cache(async (queryString: string) => {
  const query = queryString ? `?${queryString}` : "";
  return apiGet<AnalyticsTimeSeriesResponse>(`/analytics/time-series${query}`, {
    next: { revalidate: 60 },
  });
});

async function HistoricalPriceSection({ queryString }: { queryString: string }) {
  const timeSeries = await loadTimeSeries(queryString);
  return (
    <>
      <PriceTrendInsight data={timeSeries.marketOverTime} />
      <LazyHistoricalPriceChart data={timeSeries.marketOverTime} />
    </>
  );
}

async function MarketActivitySection({ queryString }: { queryString: string }) {
  const timeSeries = await loadTimeSeries(queryString);
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

function PriceTrendInsight({ data }: { data: AnalyticsTimeSeriesResponse["marketOverTime"] }) {
  const points = [...data]
    .filter((point) => point.medianAskingPriceEur !== null)
    .sort((left, right) => left.bucket.localeCompare(right.bucket));
  if (points.length < 2) {
    return null;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const firstPrice = first.medianAskingPriceEur;
  const lastPrice = last.medianAskingPriceEur;
  if (firstPrice === null || lastPrice === null || firstPrice === 0) {
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
          Median asking prices are {stable ? direction : `${formatNumber(Math.abs(Number(change.toFixed(1))))}% ${direction}`} across the observed window.
        </strong>
        <p>
          {formatCurrency(firstPrice)} on {formatDate(`${first.bucket}T00:00:00`)} to {formatCurrency(lastPrice)} on {formatDate(`${last.bucket}T00:00:00`)} · latest period includes {formatNumber(last.askingPriceSampleSize)} asking-price observations. Vehicle mix can change between periods.
        </p>
      </div>
    </aside>
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
  const query = new URLSearchParams(searchParamsToQueryString(params));
  for (const key of ["from", "to", "interval", "page", "pageSize", "sort"]) {
    query.delete(key);
  }
  const value = query.toString();
  return value ? `/listings?${value}` : "/listings";
}
