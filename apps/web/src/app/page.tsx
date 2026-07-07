import Link from "next/link";
import {
  ApiError,
  apiGet,
  searchParamsToQueryString,
  type MarketOverviewResponse,
} from "@/lib/api";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const queryString = searchParamsToQueryString(params);
  const selectedMake = single(params.make);
  const selectedModel = single(params.model);
  const pageTitle = [selectedMake, selectedModel].filter(Boolean).join(" ") || "Market listings";
  const result = await loadHomeData(queryString);

  if (!result.ok) {
    const message =
      result.error instanceof ApiError
        ? `API request failed with status ${result.error.status}.`
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

  const { filters, analytics, listings } = result.data;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Nettiauto Analytics</p>
          <h1>{pageTitle}</h1>
        </div>
        <Link className="text-link" href="/admin/crawler">
          Admin
        </Link>
      </header>

      <section className="toolbar" aria-label="Filters">
        <form className="filter-grid" action="/" method="get">
            <label>
              Make
              <input name="make" defaultValue={selectedMake} list="makes" />
            </label>
            <label>
              Model
              <input name="model" defaultValue={selectedModel} list="models" />
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
              Max year
              <input
                name="modelYearTo"
                inputMode="numeric"
                defaultValue={single(params.modelYearTo)}
              />
            </label>
            <label>
              Min price
              <input name="priceMin" inputMode="numeric" defaultValue={single(params.priceMin)} />
            </label>
            <label>
              Max price
              <input name="priceMax" inputMode="numeric" defaultValue={single(params.priceMax)} />
            </label>
            <label>
              Min mileage
              <input
                name="mileageMin"
                inputMode="numeric"
                defaultValue={single(params.mileageMin)}
              />
            </label>
            <label>
              Max mileage
              <input
                name="mileageMax"
                inputMode="numeric"
                defaultValue={single(params.mileageMax)}
              />
            </label>
            <label>
              Seller
              <select name="sellerType" defaultValue={single(params.sellerType)}>
                <option value="">Any seller</option>
                {filters.sellerTypes.map((sellerType) => (
                  <option key={sellerType} value={sellerType}>
                    {sellerType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input name="from" type="date" defaultValue={single(params.from)} />
            </label>
            <label>
              To
              <input name="to" type="date" defaultValue={single(params.to)} />
            </label>
            <label>
              Interval
              <select name="interval" defaultValue={single(params.interval) || "week"}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
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
            <div className="filter-actions">
              <button type="submit">Apply</button>
              <Link className="button-link secondary-button" href="/">
                Reset
              </Link>
            </div>
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
            label="Median Observed Sold Price"
            value={formatCurrency(analytics.summary.medianObservedSoldPriceEur)}
          />
          <Metric label="Median mileage" value={formatKm(analytics.summary.medianMileageKm)} />
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
}

async function loadHomeData(queryString: string): Promise<
  | {
      ok: true;
      data: MarketOverviewResponse;
    }
  | { ok: false; error: unknown }
> {
  try {
    const overview = await apiGet<MarketOverviewResponse>(
      `/market/overview${queryString ? `?${queryString}` : ""}`,
      { next: { revalidate: 60 } },
    );

    return {
      ok: true,
      data: overview,
    };
  } catch (error) {
    return { ok: false, error };
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
