import type { CSSProperties, ReactNode } from "react";
import type { AnalyticsTrendResponse } from "@/lib/api";
import {
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatKm,
  formatNumber,
} from "@/lib/format";

type Charts = AnalyticsTrendResponse["charts"];

export function ChartPanel({
  title,
  meta,
  legend = false,
  rangeLegend = false,
  activityLegend = false,
  full = false,
  availability = "all",
  children,
}: {
  title: string;
  meta?: string;
  legend?: boolean;
  rangeLegend?: boolean;
  activityLegend?: boolean;
  full?: boolean;
  availability?: "all" | "current" | "sold";
  children: ReactNode;
}) {
  return (
    <section className={`chart-panel ${full ? "chart-panel-full" : ""}`}>
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          {meta ? <p>{meta}</p> : null}
        </div>
        {activityLegend ? <ActivityLegend /> : legend ? <PriceLegend showRange={rangeLegend} availability={availability} /> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyChart({
  title,
  message,
  full = false,
}: {
  title: string;
  message: string;
  full?: boolean;
}) {
  return (
    <ChartPanel title={title} full={full}>
      <div className="chart-empty">{message}</div>
    </ChartPanel>
  );
}

export function ChartLoadingCanvas({ label }: { label: string }) {
  return (
    <>
      <div className="chart-canvas chart-canvas-loading skeleton-block" aria-hidden="true" />
      <span className="sr-only" role="status">
        Loading {label}. Exact data is available below.
      </span>
    </>
  );
}

export function HistoricalPriceTable({ data }: { data: Charts["marketOverTime"] }) {
  return (
    <details className="chart-data">
      <summary>View exact historical price data</summary>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Median asking</th>
              <th scope="col">Observed-sold listing price</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.bucket}>
                <th scope="row">{formatObservedDate(row.bucket)}</th>
                <td>
                  <SampledValue
                    value={formatCurrency(row.medianAskingPriceEur)}
                    sample={row.askingPriceSampleSize}
                  />
                </td>
                <td>
                  <SampledValue
                    value={formatCurrency(row.medianObservedSoldPriceEur)}
                    sample={row.observedSoldPriceSampleSize}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function PriceByYearTable({ data }: { data: Charts["priceByYear"] }) {
  return (
    <details className="chart-data">
      <summary>View exact model-year data</summary>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Model year</th>
              <th scope="col">Listings</th>
              <th scope="col">Median asking</th>
              <th scope="col">Middle 50%</th>
              <th scope="col">Observed-sold price</th>
              <th scope="col">Median mileage</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.yearModel}>
                <th scope="row">{row.yearModel}</th>
                <td>{formatNumber(row.listingCount)}</td>
                <td>
                  <SampledValue value={formatCurrency(row.medianAskingPriceEur)} sample={row.askingPriceSampleSize} />
                </td>
                <td>{formatPriceRange(row.askingPriceP25Eur, row.askingPriceP75Eur)}</td>
                <td>
                  <SampledValue
                    value={formatCurrency(row.medianObservedSoldPriceEur)}
                    sample={row.observedSoldPriceSampleSize}
                  />
                </td>
                <td>{formatKm(row.medianMileageKm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function PriceByMileageTable({ data }: { data: Charts["priceByMileageBucket"] }) {
  return (
    <details className="chart-data">
      <summary>View exact mileage data</summary>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Mileage</th>
              <th scope="col">Listings</th>
              <th scope="col">Median asking</th>
              <th scope="col">Middle 50%</th>
              <th scope="col">Observed-sold price</th>
              <th scope="col">Median model year</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.bucketStartKm}>
                <th scope="row">{formatKmBucket(row.bucketStartKm)}</th>
                <td>{formatNumber(row.listingCount)}</td>
                <td>
                  <SampledValue value={formatCurrency(row.medianAskingPriceEur)} sample={row.askingPriceSampleSize} />
                </td>
                <td>{formatPriceRange(row.askingPriceP25Eur, row.askingPriceP75Eur)}</td>
                <td>
                  <SampledValue
                    value={formatCurrency(row.medianObservedSoldPriceEur)}
                    sample={row.observedSoldPriceSampleSize}
                  />
                </td>
                <td>{row.medianYearModel ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TransmissionComparison({ data }: { data: Charts["priceByTransmission"] }) {
  return (
    <CategoryPriceComparison
      data={data.map((row) => ({ ...row, category: row.transmission }))}
      ariaLabel="Median asking price by transmission"
    />
  );
}

export function FuelTypeComparison({ data }: { data: Charts["priceByFuelType"] }) {
  return (
    <CategoryPriceComparison
      data={data.map((row) => ({ ...row, category: row.fuelType }))}
      ariaLabel="Median asking price by fuel type"
    />
  );
}

type CategoryPricePoint = Omit<Charts["priceByTransmission"][number], "transmission"> & {
  category: string;
};

function CategoryPriceComparison({
  data,
  ariaLabel,
}: {
  data: CategoryPricePoint[];
  ariaLabel: string;
}) {
  const maxAskingPrice = Math.max(1, ...data.map((row) => row.medianAskingPriceEur ?? 0));
  return (
    <div className="transmission-comparison" aria-label={ariaLabel}>
      {data.map((row) => {
        const width = ((row.medianAskingPriceEur ?? 0) / maxAskingPrice) * 100;
        const style = { "--comparison-width": `${width}%` } as CSSProperties;
        return (
          <div className="transmission-row" key={row.category}>
            <div className="transmission-label">
              <strong>{row.category}</strong>
              <span>{formatNumber(row.listingCount)} listings</span>
            </div>
            <div className="transmission-value">
              <span className="comparison-track" aria-hidden="true" style={style}>
                <span />
              </span>
              <strong>{formatCurrency(row.medianAskingPriceEur)}</strong>
              <small>
                {row.medianObservedSoldPriceEur === null
                  ? "No observed-sold price"
                  : `${formatCurrency(row.medianObservedSoldPriceEur)} on observed-sold listings`}
              </small>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TransmissionTable({ data }: { data: Charts["priceByTransmission"] }) {
  return (
    <CategoryPriceTable
      data={data.map((row) => ({ ...row, category: row.transmission }))}
      categoryLabel="Transmission"
    />
  );
}

export function FuelTypeTable({ data }: { data: Charts["priceByFuelType"] }) {
  return (
    <CategoryPriceTable
      data={data.map((row) => ({ ...row, category: row.fuelType }))}
      categoryLabel="Fuel type"
    />
  );
}

function CategoryPriceTable({
  data,
  categoryLabel,
}: {
  data: CategoryPricePoint[];
  categoryLabel: string;
}) {
  return (
    <details className="chart-data">
      <summary>View exact {categoryLabel.toLowerCase()} data</summary>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">{categoryLabel}</th>
              <th scope="col">Listings</th>
              <th scope="col">Median asking</th>
              <th scope="col">Middle 50%</th>
              <th scope="col">Median mileage</th>
              <th scope="col">Observed-sold price</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.category}>
                <th scope="row">{row.category}</th>
                <td>{formatNumber(row.listingCount)}</td>
                <td>{formatCurrency(row.medianAskingPriceEur)}</td>
                <td>{formatPriceRange(row.askingPriceP25Eur, row.askingPriceP75Eur)}</td>
                <td>{formatKm(row.medianMileageKm)}</td>
                <td>{formatCurrency(row.medianObservedSoldPriceEur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ActivityTable({ data }: { data: Charts["marketOverTime"] }) {
  return (
    <details className="chart-data">
      <summary>View exact listing-activity data</summary>
      <div className="chart-table-wrap">
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Period</th>
              <th scope="col">Current</th>
              <th scope="col">Observed-sold</th>
              <th scope="col">First observed</th>
              <th scope="col">Total observed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.bucket}>
                <th scope="row">{formatObservedDate(row.bucket)}</th>
                <td>{formatObservedCount(row.activeCount)}</td>
                <td>{formatObservedCount(row.soldCount)}</td>
                <td>{formatNumber(row.newListingCount)}</td>
                <td>{formatNumber(row.listingCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PriceLegend({ showRange, availability }: { showRange: boolean; availability: "all" | "current" | "sold" }) {
  return (
    <div className="chart-legend" aria-label="Chart legend">
      {availability !== "sold" && <span><i className="legend-line legend-asking" aria-hidden="true" /> Asking</span>}
      {availability !== "current" && <span><i className="legend-line legend-sold" aria-hidden="true" /> Observed-sold listing</span>}
      {showRange ? (
        <span><i className="legend-range" aria-hidden="true" /> Asking middle 50% (p25–p75)</span>
      ) : null}
    </div>
  );
}

function ActivityLegend() {
  return (
    <div className="chart-legend" aria-label="Chart legend">
      <span><i className="legend-bar legend-current" aria-hidden="true" /> Current</span>
      <span><i className="legend-bar legend-observed-sold" aria-hidden="true" /> Observed-sold</span>
      <span><i className="legend-line legend-first-observed" aria-hidden="true" /> First observed</span>
    </div>
  );
}

function SampledValue({ value, sample }: { value: string; sample: number }) {
  return (
    <span className="sampled-value">
      {value}
      <small>{formatNumber(sample)} observations</small>
    </span>
  );
}

export function formatObservedDate(value: string | number) {
  const numericValue = Number(value);
  return formatDate(Number.isFinite(numericValue) ? numericValue : String(value));
}

export function formatKmBucket(value: string | number) {
  const start = Number(value);
  return `${formatCompactNumber(start)} km–${formatCompactNumber(start + 24_999)} km`;
}

function formatPriceRange(start: number | null, end: number | null) {
  return start === null || end === null ? "–" : `${formatCurrency(start)}–${formatCurrency(end)}`;
}

function formatObservedCount(value: number | null) {
  return value === null ? "Not observed" : formatNumber(value);
}
