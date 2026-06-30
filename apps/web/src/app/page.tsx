import Link from "next/link";
import {
  ApiError,
  apiGet,
  searchParamsToQueryString,
  type AnalyticsTrendResponse,
  type FilterMetadata,
  type ListingSearchResponse,
} from "@/lib/api";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const queryString = searchParamsToQueryString(params);

  try {
    const [filters, analytics, listings] = await Promise.all([
      apiGet<FilterMetadata>("/filters"),
      apiGet<AnalyticsTrendResponse>(`/analytics/trends${queryString ? `?${queryString}` : ""}`),
      apiGet<ListingSearchResponse>(`/listings${queryString ? `?${queryString}` : ""}`),
    ]);

    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Nettiauto Analytics</p>
            <h1>Market listings</h1>
          </div>
          <Link className="text-link" href="/admin/crawler">
            Admin
          </Link>
        </header>

        <section className="toolbar" aria-label="Filters">
          <form className="filter-grid" action="/" method="get">
            <label>
              Make
              <input name="make" defaultValue={single(params.make)} list="makes" />
            </label>
            <label>
              Model
              <input name="model" defaultValue={single(params.model)} list="models" />
            </label>
            <label>
              Availability
              <select name="availability" defaultValue={single(params.availability) || "all"}>
                {filters.availability.map((availability) => (
                  <option key={availability} value={availability}>
                    {labelAvailability(availability)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min year
              <input
                name="modelYearFrom"
                inputMode="numeric"
                defaultValue={single(params.modelYearFrom)}
              />
            </label>
            <label>
              Max price
              <input name="priceMax" inputMode="numeric" defaultValue={single(params.priceMax)} />
            </label>
            <label>
              Sort
              <select name="sort" defaultValue={single(params.sort) || "lastSeenDesc"}>
                <option value="lastSeenDesc">Last seen</option>
                <option value="priceAsc">Price low</option>
                <option value="priceDesc">Price high</option>
                <option value="mileageAsc">Mileage low</option>
                <option value="mileageDesc">Mileage high</option>
                <option value="yearDesc">Newest year</option>
              </select>
            </label>
            <button type="submit">Apply</button>
          </form>
          <datalist id="makes">
            {filters.makes.map((make) => (
              <option key={make} value={make} />
            ))}
          </datalist>
          <datalist id="models">
            {filters.models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </section>

        <section className="metrics" aria-label="Summary">
          <Metric label="Listings" value={formatNumber(analytics.summary.listingCount)} />
          <Metric label="Active" value={formatNumber(analytics.summary.activeCount)} />
          <Metric label="Sold" value={formatNumber(analytics.summary.soldCount)} />
          <Metric
            label="Median asking"
            value={formatCurrency(analytics.summary.medianAskingPriceEur)}
          />
          <Metric
            label="Median observed sold"
            value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)}
          />
          <Metric label="Median mileage" value={formatKm(analytics.summary.medianMileageKm)} />
        </section>

        <section className="split">
          <div className="panel">
            <h2>Trend</h2>
            <div className="trend-list">
              {analytics.timeSeries.length === 0 ? (
                <p className="muted">No trend data yet.</p>
              ) : (
                analytics.timeSeries.map((point) => (
                  <div key={point.bucket} className="trend-row">
                    <span>{point.bucket}</span>
                    <strong>{formatNumber(point.listingCount)}</strong>
                    <span>{formatCurrency(point.medianAskingPriceEur)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <h2>Make breakdown</h2>
            <div className="trend-list">
              {analytics.breakdowns.byMake.length === 0 ? (
                <p className="muted">No make data yet.</p>
              ) : (
                analytics.breakdowns.byMake.map((row) => (
                  <div key={row.make} className="trend-row">
                    <span>{row.make}</span>
                    <strong>{formatNumber(row.count)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="coverage">
          <span>Freshness: {formatDate(analytics.coverage.lastRelevantCrawlAt)}</span>
          <span>Sample: {formatNumber(analytics.coverage.sampleSize)}</span>
          <span>Completeness: {analytics.coverage.completeness}</span>
          <span>
            Includes: {analytics.coverage.includesCurrent ? "current" : ""}
            {analytics.coverage.includesCurrent && analytics.coverage.includesSold ? " + " : ""}
            {analytics.coverage.includesSold ? "sold" : ""}
            {!analytics.coverage.includesCurrent && !analytics.coverage.includesSold ? "none" : ""}
          </span>
        </section>

        <section className="table-wrap" aria-label="Listings">
          <div className="section-heading">
            <h2>Listings</h2>
            <span>
              Page {listings.pagination.page} of {listings.pagination.totalPages}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Year</th>
                <th>Availability</th>
                <th>Price</th>
                <th>Mileage</th>
                <th>Seller</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {listings.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    No listings match these filters.
                  </td>
                </tr>
              ) : (
                listings.items.map((listing) => (
                  <tr key={listing.listingId}>
                    <td>
                      <Link href={`/listings/${listing.listingId}`}>
                        {[listing.make, listing.model].filter(Boolean).join(" ") || "Unknown listing"}
                      </Link>
                      <span className="subtle">{listing.sourceListingId}</span>
                    </td>
                    <td>{listing.yearModel ?? "-"}</td>
                    <td>{labelAvailability(listing.availability)}</td>
                    <td>{formatCurrency(listing.askingPriceEur ?? listing.observedSoldPriceEur)}</td>
                    <td>{formatKm(listing.mileageKm)}</td>
                    <td>{listing.seller ?? "-"}</td>
                    <td>{formatDate(listing.lastSeenAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `API request failed with status ${error.status}.`
        : "Unable to load analytics data.";

    return (
      <main className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Nettiauto Analytics</p>
            <h1>Market listings</h1>
          </div>
        </header>
        <section className="panel error-state">
          <h2>Data unavailable</h2>
          <p>{message}</p>
        </section>
      </main>
    );
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fi-FI").format(value);
}

function formatCurrency(value: number | null) {
  return value === null ? "-" : `${new Intl.NumberFormat("fi-FI").format(value)} EUR`;
}

function formatKm(value: number | null) {
  return value === null ? "-" : `${new Intl.NumberFormat("fi-FI").format(value)} km`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function labelAvailability(value: string) {
  if (value === "current" || value === "active") {
    return "Current";
  }

  if (value === "sold") {
    return "Sold";
  }

  if (value === "all") {
    return "All";
  }

  return "Unknown";
}
