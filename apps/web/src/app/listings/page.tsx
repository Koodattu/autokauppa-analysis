import Link from "next/link";
import {
  ApiError,
  apiGet,
  filterMetadataQueryString,
  searchParamsToQueryString,
  type FilterMetadata,
  type ListingSearchResponse,
  type ListingTableItem,
} from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatKm,
  formatNumber,
  labelAvailability,
} from "@/lib/format";
import { MarketFilterForm, type PageSearchParams } from "../market-filter-form";
import { SiteHeader } from "../site-header";

type PageProps = {
  searchParams: Promise<PageSearchParams>;
};

export default async function ListingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await loadListingsData(searchParamsToQueryString(params));

  if (!result.ok) {
    return <ListingsError error={result.error} />;
  }

  const { filters, listings } = result.data;

  return (
    <main className="shell">
      <SiteHeader active="listings" />
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Market data</p>
          <h1>Listings</h1>
          <p className="heading-meta">
            {formatNumber(listings.pagination.totalItems)} results · observed through {formatDateTime(listings.coverage.lastRelevantCrawlAt)}
          </p>
        </div>
        <Link className="button-link secondary-button" href={analyticsHref(params)}>
          Analyze results
        </Link>
      </section>

      <MarketFilterForm
        key={searchParamsToQueryString(params)}
        action="/listings"
        filters={filters}
        params={params}
        variant="listings"
      />

      <section className="table-wrap listing-results" aria-label="Listings">
        <div className="section-heading">
          <h2>Results</h2>
          <span>
            Page {listings.pagination.page} of {listings.pagination.totalPages}
          </span>
        </div>
        {listings.items.length === 0 ? (
          <div className="empty-state">
            <h2>No matching listings</h2>
            <Link className="text-link" href="/listings">
              Clear filters
            </Link>
          </div>
        ) : (
          <>
            <table className="listing-table">
              <thead>
                <tr>
                  <th scope="col">Listing</th>
                  <th scope="col">Price</th>
                  <th scope="col">Mileage</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Seller</th>
                  <th scope="col">Last observed</th>
                </tr>
              </thead>
              <tbody>
                {listings.items.map((listing) => (
                  <tr key={listing.listingId}>
                    <td>
                      <ListingLink listing={listing} />
                    </td>
                    <td><ListingPrice listing={listing} /></td>
                    <td>{formatKm(listing.mileageKm)}</td>
                    <td>
                      <span className={`status-badge status-${statusTone(listing.availability)}`}>
                        {labelAvailability(listing.availability)}
                      </span>
                    </td>
                    <td><ListingSeller listing={listing} /></td>
                    <td>{formatDateTime(listing.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="listing-cards">
              {listings.items.map((listing) => (
                <article className="listing-card" key={listing.listingId}>
                  <div className="listing-card-heading">
                    <ListingLink listing={listing} />
                    <span className={`status-badge status-${statusTone(listing.availability)}`}>
                      {labelAvailability(listing.availability)}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Price</dt>
                      <dd><ListingPrice listing={listing} /></dd>
                    </div>
                    <div>
                      <dt>Mileage</dt>
                      <dd>{formatKm(listing.mileageKm)}</dd>
                    </div>
                    <div>
                      <dt>Seller</dt>
                      <dd><ListingSeller listing={listing} /></dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <Pagination listings={listings} params={params} />
    </main>
  );
}

function ListingLink({ listing }: { listing: ListingTableItem }) {
  const title = [listing.make, listing.model].filter(Boolean).join(" ") || "Unknown listing";
  return (
    <Link className="listing-link" href={`/listings/${listing.listingId}`}>
      <strong>{title}</strong>
      <span>
        {listing.yearModel ?? "Year unknown"} · {listing.sourceListingId}
      </span>
    </Link>
  );
}

function ListingPrice({ listing }: { listing: ListingTableItem }) {
  const qualifier = listing.askingPriceEur !== null
    ? "Asking"
    : listing.observedSoldPriceEur !== null
      ? "Observed sold"
      : null;
  return (
    <span className="qualified-value">
      {formatCurrency(listing.askingPriceEur ?? listing.observedSoldPriceEur)}
      {qualifier ? <small>{qualifier}</small> : null}
    </span>
  );
}

function ListingSeller({ listing }: { listing: ListingTableItem }) {
  return (
    <span className="qualified-value">
      {listing.seller ?? "–"}
      {listing.sellerType ? <small>{listing.sellerType}</small> : null}
    </span>
  );
}

function Pagination({ listings, params }: { listings: ListingSearchResponse; params: PageSearchParams }) {
  const { page, totalPages } = listings.pagination;
  return (
    <nav className="pagination" aria-label="Listings pagination">
      {page > 1 ? (
        <Link className="button-link secondary-button" href={pageHref(params, page - 1)}>
          Previous
        </Link>
      ) : (
        <span className="button-link secondary-button disabled">Previous</span>
      )}
      <span>
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link className="button-link secondary-button" href={pageHref(params, page + 1)}>
          Next
        </Link>
      ) : (
        <span className="button-link secondary-button disabled">Next</span>
      )}
    </nav>
  );
}

async function loadListingsData(queryString: string): Promise<
  | { ok: true; data: { filters: FilterMetadata; listings: ListingSearchResponse } }
  | { ok: false; error: unknown }
> {
  try {
    const query = queryString ? `?${queryString}` : "";
    const filterQueryString = filterMetadataQueryString(queryString);
    const filterQuery = filterQueryString ? `?${filterQueryString}` : "";
    const [filters, listings] = await Promise.all([
      apiGet<FilterMetadata>(`/filters${filterQuery}`, { next: { revalidate: 300 } }),
      apiGet<ListingSearchResponse>(`/listings${query}`, { next: { revalidate: 60 } }),
    ]);
    return { ok: true, data: { filters, listings } };
  } catch (error) {
    return { ok: false, error };
  }
}

function pageHref(params: PageSearchParams, page: number) {
  const query = new URLSearchParams(searchParamsToQueryString(params));
  query.set("page", String(page));
  return `/listings?${query.toString()}`;
}

function analyticsHref(params: PageSearchParams) {
  const query = new URLSearchParams(searchParamsToQueryString(params));
  for (const key of ["page", "pageSize", "sort"]) {
    query.delete(key);
  }
  const value = query.toString();
  return value ? `/?${value}` : "/";
}

function ListingsError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError && error.status === 400
      ? "Check the selected filters and try again."
      : "Listings are temporarily unavailable.";
  return (
    <main className="shell">
      <SiteHeader active="listings" />
      <section className="panel error-state page-error">
        <h1>Listings unavailable</h1>
        <p>{message}</p>
        <Link className="button-link" href="/listings">
          Clear filters
        </Link>
      </section>
    </main>
  );
}

function statusTone(availability: string) {
  if (availability === "sold") {
    return "warning";
  }
  if (availability === "active" || availability === "current") {
    return "default";
  }
  return "neutral";
}
