import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import {
  ApiError,
  getPublicListingDetail,
  type PublicListingDetailResponse,
} from "@/lib/api";
import { safeListingsReturnHref } from "@/lib/url-filter-navigation";
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
import { LazyListingHistoryChart } from "./lazy-listing-history-chart";
import { SaveCar } from "../../saved-workspace";

type PageProps = {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListingPage({ params, searchParams }: PageProps) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  let data: PublicListingDetailResponse;
  try {
    data = await getPublicListingDetail(listingId, {
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
  const listingsHref = safeListingsReturnHref(query.returnTo);
  const hasHistoryChart = data.history.length >= 2 && data.history.some(
    (row) => row.askingPriceEur !== null || row.observedSoldPriceEur !== null || row.mileageKm !== null,
  );

  return (
    <main className="shell public-shell">
      <SiteHeader active="listings" />

      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href={listingsHref}>{listingsHref === "/listings" ? "Listings" : "Matching listings"}</Link>
        <span aria-hidden="true">/</span>
        <span>{data.listing.sourceListingId}</span>
      </nav>

      <section className="listing-heading">
        <div className="heading-copy">
          <div className="heading-status">
            <span className={`status-badge status-${statusTone(data.listing.availability)}`}>
              {labelAvailability(data.listing.availability)}
            </span>
            <span>#{data.listing.sourceListingId}</span>
          </div>
          <h1>{title}</h1>
          <p className="heading-meta">
            {[data.listing.seller, data.listing.sellerType].filter(Boolean).join(" · ") || "Seller unknown"}
          </p>
        </div>
        {data.listing.sourceAttribution.sourceUrl ? (
          <a
            className="button-link secondary-button"
            href={data.listing.sourceAttribution.sourceUrl}
            rel="nofollow noreferrer"
            target="_blank"
          >
            Open on Nettiauto <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </section>

      <section className="listing-hero">
        <ListingGallery images={data.imageMetadata} title={title} />
        <aside className="listing-summary panel">
          <div className="listing-price">
            <span>{data.listing.askingPriceEur !== null ? "Asking price" : "Price shown on observed-sold listing"}</span>
            <strong>{formatCurrency(data.listing.askingPriceEur ?? data.listing.observedSoldPriceEur)}</strong>
            <PricePosition context={data.marketContext} price={data.listing.askingPriceEur ?? data.listing.observedSoldPriceEur} />
            <p>
              Observed listing evidence—not a confirmed completed transaction price.
            </p>
          </div>
          <dl className="summary-list">
            <SummaryRow label="Mileage" value={formatKm(data.listing.mileageKm)} />
            <SummaryRow label="Model year" value={data.listing.yearModel ? String(data.listing.yearModel) : "–"} />
            <SummaryRow label="Transmission" value={details?.transmissionSourceLabel ?? "–"} />
            <SummaryRow label="Updated on source" value={formatDateOnly(sourceUpdatedDate)} />
            <SummaryRow label="First observed" value={formatDateTime(data.listing.firstSeenAt)} />
            <SummaryRow label="Last observed" value={formatDateTime(data.listing.lastSeenAt)} />
          </dl>
          <SaveCar id={data.listing.listingId} title={title} />
        </aside>
      </section>

      <MarketContext context={data.marketContext} returnTo={listingsHref} />

      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <h2>History</h2>
            <p>Dates are observations unless “updated on source” is shown separately.</p>
          </div>
          <span>{formatNumber(data.history.length)} observations</span>
        </div>
        {data.history.length === 0 ? (
          <p className="muted">No history recorded.</p>
        ) : (
          <>
            <HistoryInsight history={data.history} />
            {hasHistoryChart ? <LazyListingHistoryChart history={data.history} /> : null}
            <details className="chart-data"><summary>View recorded observations</summary><div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th scope="col">Observed</th>
                    <th scope="col">Availability</th>
                    <th scope="col">Price</th>
                    <th scope="col">Mileage</th>
                    <th scope="col">Updated on source</th>
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
            </div></details>
          </>
        )}
      </section>

      {detailGroups.length > 0 ? (
        <section className="panel spec-workspace" aria-label="Vehicle details">
          {detailGroups.map((group) => (
            <section className="spec-group" key={group.title}>
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

      {details?.equipmentGroups?.length ? (
        <section className="panel equipment-panel">
          <h2>Equipment</h2>
          <div className="equipment-groups">
            {details.equipmentGroups.map((group) => (
              <section key={group.label}>
                <h3>{group.label}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ) : null}

      {details?.sellerNotes ? (
        <section className="panel seller-notes">
          <h2>Seller notes</h2>
          <p>{details.sellerNotes}</p>
        </section>
      ) : null}

      <section className="panel source-panel">
        <div className="panel-heading">
          <div>
            <h2>Source and interpretation</h2>
            <p>Values were observed from the source listing and may change after the last observation.</p>
          </div>
        </div>
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

function MarketContext({ context, returnTo }: { context: PublicListingDetailResponse["marketContext"]; returnTo: string }) {
  const priceBasis = context.priceBasis === "asking"
    ? "asking-price"
    : context.priceBasis === "observed_sold"
      ? "observed-sold listing-price"
      : "price";
  return (
    <section className="panel market-context-panel" aria-labelledby="market-context-title">
      <div className="panel-heading">
        <div>
          <h2 id="market-context-title">Comparable cars and evidence</h2>
          <p>{context.cohortDescription}. Comparisons are unadjusted for other equipment and condition differences.</p>
        </div>
        <span>{formatNumber(context.sampleSize)} comparable prices</span>
      </div>
      <dl className="market-context-values">
        <SummaryRow label={`Median ${priceBasis}`} value={formatCurrency(context.medianPriceEur)} />
        <SummaryRow label="Middle 50%" value={formatPriceRange(context.priceP25Eur, context.priceP75Eur)} />
        <SummaryRow label="Price position" value={formatPricePosition(context.pricePercentile)} />
        <SummaryRow label="Observed duration" value={`${formatNumber(context.observedDays)} day${context.observedDays === 1 ? "" : "s"}`} />
        <SummaryRow label="Recorded price changes" value={formatNumber(context.recordedPriceChangeCount)} />
      </dl>
      {context.sampleSize > 0 && context.sampleSize < 5 ? (
        <p className="market-context-caveat">The comparable sample is very small; treat the price position as directional only.</p>
      ) : null}
      {context.limitations?.map((limitation) => <p className="muted" key={limitation}>{limitation}</p>)}
      <p className="muted">Observed duration runs from first to last capture, not from publication to sale. The target listing is excluded from its own benchmark.</p>
      <div className="comparable-grid">{context.comparableListings?.map((car) => <article className="listing-card" key={car.listingId}><Link href={`/listings/${car.listingId}?${new URLSearchParams({ returnTo })}`}><strong>{car.make} {car.model} {car.yearModel}</strong></Link><p>{formatCurrency(car.askingPriceEur ?? car.observedSoldPriceEur)} · {formatKm(car.mileageKm)}</p><p>{[car.fuelType, car.transmission, car.bodyType].filter(Boolean).join(" · ")}</p><p>Observed {formatDate(car.lastSeenAt)}</p><SaveCar id={car.listingId} title={`${car.make} ${car.model} ${car.yearModel}`} /></article>)}</div>
      {!context.sampleSize && <p>No other priced listings meet these comparison criteria.</p>}
      {context.comparisonHref && <Link className="button-link secondary-button" href={context.comparisonHref}>Adjust the comparison group</Link>}
    </section>
  );
}

function PricePosition({ context, price }: { context: PublicListingDetailResponse["marketContext"]; price: number | null }) {
  if (price === null || context.medianPriceEur === null || context.sampleSize < 5) return <p>Not enough comparable prices for a price position. Inspect the available evidence below.</p>;
  const difference = price - context.medianPriceEur;
  const low = Math.min(price, context.priceP25Eur ?? price) * 0.9;
  const high = Math.max(price, context.priceP75Eur ?? price) * 1.1;
  const position = (value: number) => (value - low) / Math.max(1, high - low) * 100;
  return <div className="price-position"><p><strong>{formatCurrency(Math.abs(difference))} {difference > 0 ? "above" : difference < 0 ? "below" : "difference from"} the comparable median</strong></p>
    <div className="price-position-bar" role="img" aria-label={`This listing ${formatCurrency(price)}. Middle 50% ${formatCurrency(context.priceP25Eur)} to ${formatCurrency(context.priceP75Eur)}. Median ${formatCurrency(context.medianPriceEur)}.`}>
      <span className="price-position-range" style={{ left: `${position(context.priceP25Eur ?? price)}%`, width: `${position(context.priceP75Eur ?? price) - position(context.priceP25Eur ?? price)}%` }} /><span className="price-position-median" style={{ left: `${position(context.medianPriceEur)}%` }} /><span className="price-position-target" style={{ left: `${position(price)}%` }}>●</span>
    </div><p>Middle 50%: {formatCurrency(context.priceP25Eur)}–{formatCurrency(context.priceP75Eur)} · {context.sampleSize} other prices. Equipment and condition can explain differences.</p></div>;
}

function formatPriceRange(low: number | null, high: number | null) {
  return low === null || high === null ? "–" : `${formatCurrency(low)}–${formatCurrency(high)}`;
}

function formatPricePosition(percentile: number | null) {
  return percentile === null
    ? "–"
    : `${formatNumber(percentile)}% of comparable prices are at or below this price`;
}

function HistoryInsight({ history }: { history: PublicListingDetailResponse["history"] }) {
  const prices = history
    .map((row) => ({
      value: row.askingPriceEur ?? row.observedSoldPriceEur,
      observedAt: row.observedAt,
    }))
    .filter((row): row is { value: number; observedAt: string } => row.value !== null)
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));

  if (prices.length === 0) {
    return <p className="history-insight">No price observations are available for this listing.</p>;
  }

  if (prices.length === 1) {
    return <p className="history-insight">Only one price observation is available for this listing.</p>;
  }

  const first = prices[0];
  const last = prices[prices.length - 1];
  const difference = last.value - first.value;
  if (difference === 0) {
    const allPricesMatch = prices.every((price) => price.value === first.value);
    return (
      <p className="history-insight">
        {allPricesMatch
          ? `No price change was recorded across ${formatNumber(prices.length)} price observations.`
          : "The latest recorded price matches the first observation, with changes recorded in between."}
      </p>
    );
  }

  return (
    <p className="history-insight">
      The latest recorded price is <strong>{formatCurrency(Math.abs(difference))} {difference > 0 ? "higher" : "lower"}</strong> than the first price observation.
    </p>
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
        ["Office fee", details.officeFeeEur === null ? null : formatCurrency(details.officeFeeEur)],
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
        ["Energy class", details.energyEfficiencyClassSourceLabel],
        ["City consumption", formatConsumption(details.fuelConsumptionCityL100Km)],
        ["Highway consumption", formatConsumption(details.fuelConsumptionHighwayL100Km)],
        ["Combined consumption", formatConsumption(details.fuelConsumptionCombinedL100Km)],
        [
          "Consumption",
          details.fuelConsumptionCityL100Km === null &&
          details.fuelConsumptionHighwayL100Km === null &&
          details.fuelConsumptionCombinedL100Km === null
            ? details.fuelConsumptionSourceLabel
            : null,
        ],
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
  return value ? formatDate(value) : null;
}

function formatConsumption(value: number | null) {
  return value === null ? null : `${formatNumber(value)} l/100 km`;
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
