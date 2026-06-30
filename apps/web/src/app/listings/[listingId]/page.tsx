import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiGet, type PublicListingDetailResponse } from "@/lib/api";

type PageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function ListingPage({ params }: PageProps) {
  const { listingId } = await params;
  let data: PublicListingDetailResponse;
  try {
    data = await apiGet<PublicListingDetailResponse>(`/listings/${listingId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const title =
    [data.listing.make, data.listing.model, data.listing.yearModel].filter(Boolean).join(" ") ||
    "Unknown listing";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Listing</p>
          <h1>{title}</h1>
        </div>
        <Link className="text-link" href="/">
          Analytics
        </Link>
      </header>

      <section className="metrics">
        <Metric label="Availability" value={labelAvailability(data.listing.availability)} />
        <Metric
          label="Price"
          value={formatCurrency(data.listing.askingPriceEur ?? data.listing.observedSoldPriceEur)}
        />
        <Metric label="Mileage" value={formatKm(data.listing.mileageKm)} />
        <Metric label="First seen" value={formatDate(data.listing.firstSeenAt)} />
        <Metric label="Last seen" value={formatDate(data.listing.lastSeenAt)} />
      </section>

      <section className="split">
        <div className="panel">
          <h2>Source Attribution</h2>
          <dl className="details">
            <dt>Source</dt>
            <dd>{data.listing.sourceAttribution.source}</dd>
            <dt>Source listing ID</dt>
            <dd>{data.listing.sourceAttribution.sourceListingId}</dd>
            <dt>Observed data</dt>
            <dd>{data.listing.sourceAttribution.observedDataLabel}</dd>
            <dt>Source page</dt>
            <dd>
              {data.listing.sourceAttribution.sourceUrl ? (
                <a href={data.listing.sourceAttribution.sourceUrl} rel="nofollow noreferrer">
                  Open Nettiauto listing
                </a>
              ) : (
                "-"
              )}
            </dd>
          </dl>
        </div>

        <div className="panel">
          <h2>History</h2>
          <div className="trend-list">
            {data.priceHistory.length === 0 ? (
              <p className="muted">No price history yet.</p>
            ) : (
              data.priceHistory.map((row) => (
                <div key={row.observedAt} className="trend-row">
                  <span>{formatDate(row.observedAt)}</span>
                  <strong>{formatCurrency(row.askingPriceEur ?? row.observedSoldPriceEur)}</strong>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="table-wrap">
        <div className="section-heading">
          <h2>Images</h2>
          <span>Metadata only</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Role</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {data.imageMetadata.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">
                  No image metadata observed.
                </td>
              </tr>
            ) : (
              data.imageMetadata.map((image) => (
                <tr key={image.imageUrl}>
                  <td className="wrap">{image.imageUrl}</td>
                  <td>{image.role ?? "-"}</td>
                  <td>{image.position ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
  if (value === "active" || value === "current") {
    return "Current";
  }

  if (value === "sold") {
    return "Sold";
  }

  return "Unknown";
}
