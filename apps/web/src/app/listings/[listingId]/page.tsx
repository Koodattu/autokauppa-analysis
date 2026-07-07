import Link from "next/link";
import { Fragment } from "react";
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
  const vehicleRows = data.vehicleDetails ? vehicleDetailRows(data.vehicleDetails) : [];

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

      {vehicleRows.length > 0 ? (
        <section className="panel">
          <h2>Vehicle Details</h2>
          <dl className="details">
            {vehicleRows.map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ) : null}

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

      <section className="image-section">
        <div className="image-section-heading">
          <h2>Images</h2>
          <span>{data.imageMetadata.length} observed</span>
        </div>
        {data.imageMetadata.length === 0 ? (
          <p className="empty image-empty">No image metadata observed.</p>
        ) : (
          <div className="image-grid">
            {data.imageMetadata.map((image, index) => (
              <a
                key={image.imageUrl}
                className="image-tile"
                href={image.imageUrl}
                rel="nofollow noreferrer"
                target="_blank"
              >
                <img
                  src={image.imageUrl}
                  alt={`${title} image ${image.position ?? index + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <span>
                  {image.role ?? "image"}
                  {image.position ? ` #${image.position}` : ""}
                </span>
              </a>
            ))}
          </div>
        )}
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

function formatDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function vehicleDetailRows(details: NonNullable<PublicListingDetailResponse["vehicleDetails"]>) {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Updated on Nettiauto", value: formatDateOnly(details.sourceUpdatedDate) },
    { label: "Location", value: details.sourceLocationLabel },
    { label: "Registration number", value: details.registrationNumber },
    { label: "Vehicle type", value: details.vehicleTypeSourceLabel },
    { label: "Body type", value: details.bodyTypeSourceLabel },
    { label: "Color", value: details.colorSourceLabel },
    { label: "Engine", value: details.engineSourceLabel },
    { label: "Fuel", value: details.fuelTypeSourceLabel },
    { label: "Transmission", value: details.transmissionSourceLabel },
    { label: "Drivetrain", value: details.drivetrainSourceLabel },
    { label: "Power", value: formatPower(details.powerKw, details.powerHp) },
    { label: "First registration", value: formatDateOnly(details.firstRegistrationDate) },
    { label: "Inspection", value: details.inspectionDateLabel },
    { label: "Seats", value: formatCount(details.seatCount) },
    { label: "Doors", value: formatCount(details.doorCount) },
    { label: "Steering", value: details.steeringSideSourceLabel },
    { label: "CO2", value: formatUnit(details.co2GKm, "g/km") },
    { label: "Consumption", value: details.fuelConsumptionSourceLabel },
    { label: "Curb weight", value: formatUnit(details.curbWeightKg, "kg") },
    { label: "Gross weight", value: formatUnit(details.grossWeightKg, "kg") },
    { label: "Braked towing mass", value: formatUnit(details.towingWeightBrakedKg, "kg") },
    { label: "Unbraked towing mass", value: formatUnit(details.towingWeightUnbrakedKg, "kg") },
    { label: "Top speed", value: formatUnit(details.topSpeedKmh, "km/h") },
    { label: "0-100 km/h", value: formatUnit(details.acceleration0To100S, "s") },
    { label: "Seller notes", value: details.sellerNotes },
  ];

  return rows.filter((row) => row.value);
}

function formatPower(powerKw: number | null, powerHp: number | null) {
  if (powerKw === null && powerHp === null) {
    return null;
  }

  return [formatUnit(powerKw, "kW"), formatUnit(powerHp, "hp")].filter(Boolean).join(" / ");
}

function formatCount(value: number | null) {
  return value === null ? null : new Intl.NumberFormat("fi-FI").format(value);
}

function formatUnit(value: number | null, unit: string) {
  return value === null ? null : `${new Intl.NumberFormat("fi-FI").format(value)} ${unit}`;
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
