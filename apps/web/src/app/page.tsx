import Link from "next/link";
import {
  ApiError,
  apiGet,
  searchParamsToQueryString,
  singleSearchParam as single,
  type AnalyticsTrendResponse,
  type FilterMetadata,
} from "@/lib/api";
import { formatCurrency, formatDateTime, formatKm, formatNumber } from "@/lib/format";
import { AnalyticsCharts } from "./analytics-charts";
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
        </div>
        <Link className="button-link secondary-button" href={listingsHref}>
          View {formatNumber(analytics.summary.listingCount)} listings
        </Link>
      </section>

      <MarketFilterForm action="/" filters={filters} params={params} variant="analytics" />

      <section className="metrics analytics-metrics" aria-label="Market summary">
        <Metric
          label="Listings"
          value={formatNumber(analytics.summary.listingCount)}
          detail={`${formatNumber(analytics.summary.activeCount)} current · ${formatNumber(analytics.summary.soldCount)} sold`}
        />
        <Metric
          label="Median asking price"
          value={formatCurrency(analytics.summary.medianAskingPriceEur)}
          detail={`n=${formatNumber(analytics.summary.askingPriceSampleSize)}`}
        />
        <Metric
          label="Median mileage"
          value={formatKm(analytics.summary.medianMileageKm)}
          detail={`n=${formatNumber(analytics.summary.mileageSampleSize)}`}
        />
        <Metric
          label="Median observed sold price"
          value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)}
          detail={`n=${formatNumber(analytics.summary.observedSoldPriceSampleSize)}`}
        />
      </section>

      <CoverageBar analytics={analytics} />
      <AnalyticsCharts analytics={analytics} />
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

function CoverageBar({ analytics }: { analytics: AnalyticsTrendResponse }) {
  const coverage = analytics.coverage;
  const included = coverage.includesCurrent && coverage.includesSold
    ? "Current + sold"
    : coverage.includesCurrent
      ? "Current"
      : coverage.includesSold
        ? "Sold"
        : "No listings";

  return (
    <section className="coverage" aria-label="Data coverage">
      <span>
        <strong>Freshness</strong> {formatDateTime(coverage.lastRelevantCrawlAt)}
      </span>
      <span>
        <strong>Coverage</strong> {coverage.completeness}
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
  | { ok: true; data: { filters: FilterMetadata; analytics: AnalyticsTrendResponse } }
  | { ok: false; error: unknown }
> {
  try {
    const query = queryString ? `?${queryString}` : "";
    const [filters, analytics] = await Promise.all([
      apiGet<FilterMetadata>(`/filters${query}`, { next: { revalidate: 300 } }),
      apiGet<AnalyticsTrendResponse>(`/analytics/trends${query}`, { next: { revalidate: 60 } }),
    ]);
    return { ok: true, data: { filters, analytics } };
  } catch (error) {
    return { ok: false, error };
  }
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
