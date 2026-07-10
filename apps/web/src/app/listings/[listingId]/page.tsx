import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { ApiError, apiGet, type PublicListingDetailResponse } from "@/lib/api";
import {
  formatCurrency,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatKm,
  formatNumber,
  labelAvailability,
} from "@/lib/format";
import { SiteHeader } from "../../site-header";
import { ListingGallery } from "./listing-gallery";
import { ListingHistoryChart } from "./listing-history-chart";

type PageProps = {
  params: Promise<{ listingId: string }>;
};

export default async function ListingPage({ params }: PageProps) {
  const { listingId } = await params;
  let data: PublicListingDetailResponse;
  try {
    data = await apiGet<PublicListingDetailResponse>(`/listings/${listingId}`, {
      next: { revalidate: 60 },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const title =
    [data.listing.make, data.listing.model, data.listing.yearModel].filter(Boolean).join(" ") ||
    "Unknown listing";
  const details = data.vehicleDetails;
  const detailGroups = details ? vehicleDetailGroups(details) : [];
  const sourceUpdatedDate = details?.sourceUpdatedDate ?? data.listing.sourceUpdatedDate;

  return (
    <main className="shell">
      <SiteHeader active="listings" />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/listings">Listings</Link>
        <span aria-hidden="true">/</span>
        <span>{data.listing.sourceListingId}</span>
      </nav>

      <section className="listing-heading">
        <div>
          <div className="heading-status">
            <span className={`status-badge status-${statusTone(data.listing.availability)}`}>
              {labelAvailability(data.listing.availability)}
            </span>
            <span>#{data.listing.sourceListingId}</span>
          </div>
          <h1>{title}</h1>
          <p>{[data.listing.seller, data.listing.sellerType].filter(Boolean).join(" · ") || "Seller unknown"}</p>
        </div>
        {data.listing.sourceAttribution.sourceUrl ? (
          <a
            className="button-link secondary-button"
            href={data.listing.sourceAttribution.sourceUrl}
            rel="nofollow noreferrer"
            target="_blank"
          >
            Open on Nettiauto
          </a>
        ) : null}
      </section>

      <section className="listing-hero">
        <ListingGallery images={data.imageMetadata} title={title} />
        <aside className="listing-summary panel">
          <div className="listing-price">
            <span>{data.listing.askingPriceEur !== null ? "Asking price" : "Observed sold price"}</span>
            <strong>{formatCurrency(data.listing.askingPriceEur ?? data.listing.observedSoldPriceEur)}</strong>
          </div>
          <dl className="summary-list">
            <SummaryRow label="Mileage" value={formatKm(data.listing.mileageKm)} />
            <SummaryRow label="Model year" value={data.listing.yearModel ? String(data.listing.yearModel) : "–"} />
            <SummaryRow label="Transmission" value={details?.transmissionSourceLabel ?? "–"} />
            <SummaryRow label="Updated on source" value={formatDateOnly(sourceUpdatedDate)} />
            <SummaryRow label="First observed" value={formatDateTime(data.listing.firstSeenAt)} />
            <SummaryRow label="Last observed" value={formatDateTime(data.listing.lastSeenAt)} />
          </dl>
        </aside>
      </section>

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>History</h2>
            <p>Dates are observations unless “updated on source” is shown separately.</p>
          </div>
          <span>{data.history.length} changes</span>
        </div>
        {data.history.length === 0 ? (
          <p className="muted">No history recorded.</p>
        ) : (
          <>
            <ListingHistoryChart history={data.history} />
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Observed</th>
                    <th>Availability</th>
                    <th>Price</th>
                    <th>Mileage</th>
                    <th>Updated on source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row, index) => (
                    <tr key={`${row.observedAt}-${index}`}>
                      <td>{formatDateTime(row.observedAt)}</td>
                      <td>{labelAvailability(row.availability)}</td>
                      <td>{formatCurrency(row.askingPriceEur ?? row.observedSoldPriceEur)}</td>
                      <td>{formatKm(row.mileageKm)}</td>
                      <td>{formatDateOnly(row.sourceUpdatedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {detailGroups.length > 0 ? (
        <section className="spec-grid" aria-label="Vehicle details">
          {detailGroups.map((group) => (
            <section className="panel spec-panel" key={group.title}>
              <h2>{group.title}</h2>
              <dl className="details">
                {group.rows.map((row) => (
                  <Fragment key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </section>
      ) : null}

      {details?.sellerNotes ? (
        <section className="panel seller-notes">
          <h2>Seller notes</h2>
          <p>{details.sellerNotes}</p>
        </section>
      ) : null}

      <section className="panel source-panel">
        <h2>Source</h2>
        <dl className="details compact-details">
          <dt>Source</dt>
          <dd>{data.listing.sourceAttribution.source}</dd>
          <dt>Source listing ID</dt>
          <dd>{data.listing.sourceAttribution.sourceListingId}</dd>
          <dt>Data basis</dt>
          <dd>{data.listing.sourceAttribution.observedDataLabel}</dd>
          <dt>Last observed</dt>
          <dd>{formatDateTime(data.listing.lastSeenAt)}</dd>
        </dl>
      </section>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function vehicleDetailGroups(details: NonNullable<PublicListingDetailResponse["vehicleDetails"]>) {
  return [
    {
      title: "Vehicle",
      rows: compactRows([
        ["Location", details.sourceLocationLabel],
        ["Registration number", details.registrationNumber],
        ["Vehicle type", details.vehicleTypeSourceLabel],
        ["Body type", details.bodyTypeSourceLabel],
        ["Color", details.colorSourceLabel],
        ["First registration", formatOptionalDate(details.firstRegistrationDate)],
        ["Inspection", details.inspectionDateLabel],
      ]),
    },
    {
      title: "Powertrain",
      rows: compactRows([
        ["Engine", details.engineSourceLabel],
        ["Fuel", details.fuelTypeSourceLabel],
        ["Transmission", details.transmissionSourceLabel],
        ["Drivetrain", details.drivetrainSourceLabel],
        ["Power", formatPower(details.powerKw, details.powerHp)],
        ["Consumption", details.fuelConsumptionSourceLabel],
        ["CO₂", formatUnit(details.co2GKm, "g/km")],
        ["Top speed", formatUnit(details.topSpeedKmh, "km/h")],
        ["0–100 km/h", formatUnit(details.acceleration0To100S, "s")],
      ]),
    },
    {
      title: "Dimensions and capacity",
      rows: compactRows([
        ["Seats", formatCount(details.seatCount)],
        ["Doors", formatCount(details.doorCount)],
        ["Steering", details.steeringSideSourceLabel],
        ["Curb weight", formatUnit(details.curbWeightKg, "kg")],
        ["Gross weight", formatUnit(details.grossWeightKg, "kg")],
        ["Braked towing mass", formatUnit(details.towingWeightBrakedKg, "kg")],
        ["Unbraked towing mass", formatUnit(details.towingWeightUnbrakedKg, "kg")],
      ]),
    },
  ].filter((group) => group.rows.length > 0);
}

function compactRows(rows: Array<[string, string | null]>) {
  return rows
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => ({ label, value }));
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(`${value}T00:00:00`) : null;
}

function formatPower(powerKw: number | null, powerHp: number | null) {
  const values = [formatUnit(powerKw, "kW"), formatUnit(powerHp, "hp")].filter(Boolean);
  return values.length > 0 ? values.join(" / ") : null;
}

function formatCount(value: number | null) {
  return value === null ? null : formatNumber(value);
}

function formatUnit(value: number | null, unit: string) {
  return value === null ? null : `${formatNumber(value)} ${unit}`;
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
