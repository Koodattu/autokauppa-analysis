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
import { formatCurrency, formatDateTime, formatKm, formatNumber } from "@/lib/format";
import {
  ChartPlaceholder,
  LazyAnalyticsSnapshotCharts,
  LazyHistoricalPriceChart,
  LazyMarketActivityChart,
} from "./lazy-analytics-charts";
import { MarketFilterForm, type PageSearchParams } from "./market-filter-form";
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
    <main className="shell">
      <SiteHeader active="analyze" />

      <section className="page-heading">
        <div>
          <p className="eyebrow">Market analysis</p>
          <h1>{title}</h1>
          <p className="heading-meta">Compare the typical price range, then open the matching listings.</p>
        </div>
        <Link className="button-link secondary-button" href={listingsHref}>
          View {formatNumber(analytics.summary.listingCount)} listings
        </Link>
      </section>

      <MarketFilterForm
        key={searchParamsToQueryString(params)}
        action="/"
        filters={filters}
        params={params}
        variant="analytics"
      />

      <section className="metrics analytics-metrics" aria-label="Market summary">
        <Metric
          label="Listings"
          value={formatNumber(analytics.summary.listingCount)}
          detail={`${formatNumber(analytics.summary.activeCount)} last observed as current · ${formatNumber(analytics.summary.soldCount)} observed sold`}
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
          label="Median observed sold price"
          value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)}
          detail={`${formatNumber(analytics.summary.observedSoldPriceSampleSize)} sold listings with a shown price`}
        />
      </section>

      <CoverageBar analytics={analytics} />

      <AnalyticsSectionHeading
        title="Price direction"
        description="Use the trend to see whether observed market prices are moving, not to value one car on its own."
      />
      <Suspense fallback={<ChartPlaceholder title="Price over observed time" />}>
        <HistoricalPriceSection queryString={searchParamsToQueryString(params)} />
      </Suspense>

      <AnalyticsSectionHeading
        title="What shapes the price"
        description="Compare model year and mileage first; both usually explain more than transmission alone."
      />
      <LazyAnalyticsSnapshotCharts analytics={analytics} />

      <AnalyticsSectionHeading
        title="Market activity"
        description="These are listings captured in complete crawls, not sales or point-in-time inventory."
      />
      <Suspense fallback={<ChartPlaceholder title="Listings captured per period" />}>
        <MarketActivitySection queryString={searchParamsToQueryString(params)} />
      </Suspense>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function CoverageBar({ analytics }: { analytics: AnalyticsSnapshotResponse }) {
  const coverage = analytics.coverage;
  const included = coverage.includesCurrent && coverage.includesSold
    ? "Current + sold"
    : coverage.includesCurrent
      ? "Current"
      : coverage.includesSold
        ? "Sold"
        : "No listings";

  return (
    <section
      className={`coverage coverage-${coverage.completeness}`}
      aria-label="Data coverage"
      role={coverage.completeness === "complete" ? undefined : "status"}
    >
      <span>
        <strong>Freshness</strong> {formatDateTime(coverage.lastRelevantCrawlAt)}
      </span>
      <span>
        <strong>Crawl</strong> {coverage.completeness}
      </span>
      <span>
        <strong>Listings</strong> {included}
      </span>
      <span>
        <strong>Basis</strong>{" "}
        {coverage.dataSource === "search_and_detail_data" ? "Search + detail data" : "Search result data"}
      </span>
      <span>
        <strong>Sample</strong> {formatNumber(coverage.sampleSize)} listings
      </span>
    </section>
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
  return <LazyHistoricalPriceChart data={timeSeries.marketOverTime} />;
}

async function MarketActivitySection({ queryString }: { queryString: string }) {
  const timeSeries = await loadTimeSeries(queryString);
  return <LazyMarketActivityChart data={timeSeries.marketOverTime} />;
}

function AnalyticsSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="analytics-section-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function HomeError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError && error.status === 400
      ? "Check the selected filters and try again."
      : "Market data is temporarily unavailable.";

  return (
    <main className="shell">
      <SiteHeader active="analyze" />
      <section className="panel error-state page-error">
        <h1>Data unavailable</h1>
        <p>{message}</p>
        <Link className="button-link" href="/">
          Clear filters
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
