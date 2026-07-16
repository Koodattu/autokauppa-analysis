"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { AnalyticsSnapshotResponse, AnalyticsTrendResponse } from "@/lib/api";
import { formatCurrency, formatKm, formatNumber } from "@/lib/format";

type Charts = AnalyticsTrendResponse["charts"];
type ChartRow = Record<string, unknown>;

const ASKING_COLOR = "#0f766e";
const SOLD_COLOR = "#b45309";
const COUNT_COLOR = "#334155";
const GRID_COLOR = "#e5e7eb";
const AXIS_COLOR = "#667085";

export function AnalyticsSnapshotCharts({ analytics }: { analytics: AnalyticsSnapshotResponse }) {
  return (
    <section className="analytics-grid" aria-label="Market charts">
      <PriceByYearChart data={analytics.charts.priceByYear} />
      <PriceByMileageChart data={analytics.charts.priceByMileageBucket} />
      <PriceByTransmissionComparison
        data={analytics.charts.priceByTransmission}
        totalListings={analytics.summary.listingCount}
      />
    </section>
  );
}

export function HistoricalPriceChart({ data }: { data: Charts["marketOverTime"] }) {
  return <PriceOverTimeChart data={data} />;
}

export function MarketActivityChart({ data }: { data: Charts["marketOverTime"] }) {
  return <ObservedListingsChart data={data} />;
}

function PriceOverTimeChart({ data }: { data: Charts["marketOverTime"] }) {
  const rows = withBucketTime(data);
  const pricePoints = rows.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  if (pricePoints.length < 2) {
    return (
      <EmptyChart
        title="Price over observed time"
        message="At least two observed periods are needed for a price trend."
        full
      />
    );
  }

  return (
    <ChartPanel
      title="Price over observed time"
      meta="Median price in each observed period · observed-sold values are listing evidence, not confirmed transactions"
      full
      legend
    >
      <ChartCanvas>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Price over observed time"
          desc="Median asking prices and prices shown on observed-sold listings by observation period"
        >
          <ChartGrid />
          <XAxis
            dataKey="bucketTime"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTimeAxis}
            minTickGap={32}
            {...axisProps}
          />
          <YAxis domain={["auto", "auto"]} tickFormatter={formatCurrencyCompact} width={72} {...axisProps} />
          <Tooltip content={(props) => <PriceTooltip {...props} formatLabel={formatObservedDate} />} />
          <Line
            type="monotone"
            dataKey="medianAskingPriceEur"
            name="Median asking price"
            stroke={ASKING_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="medianObservedSoldPriceEur"
            name="Observed-sold listing price"
            stroke={SOLD_COLOR}
            strokeWidth={2.5}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartCanvas>
    </ChartPanel>
  );
}

function PriceByYearChart({ data }: { data: Charts["priceByYear"] }) {
  const rows = withAskingRange(
    data.filter(
      (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
    ),
  );
  if (rows.length === 0) {
    return <EmptyChart title="Price by model year" message="No model-year price data for these filters." />;
  }

  return (
    <ChartPanel
      title="Price by model year"
      meta="Asking-price middle 50% shown as a band · compare similar mileage where possible"
      legend
    >
      <ChartCanvas>
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Price by model year"
          desc="Median price and asking-price middle 50 percent by model year"
        >
          <ChartGrid />
          <XAxis
            dataKey="yearModel"
            type="number"
            domain={["dataMin", "dataMax"]}
            allowDecimals={false}
            minTickGap={18}
            {...axisProps}
          />
          <YAxis domain={["auto", "auto"]} tickFormatter={formatCurrencyCompact} width={72} {...axisProps} />
          <Tooltip content={(props) => <PriceTooltip {...props} formatLabel={String} />} />
          <Area
            type="monotone"
            dataKey="askingRange"
            name="Asking p25–p75"
            stroke="none"
            fill={ASKING_COLOR}
            fillOpacity={0.13}
            tooltipType="none"
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="medianAskingPriceEur"
            name="Median asking price"
            stroke={ASKING_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="medianObservedSoldPriceEur"
            name="Observed-sold listing price"
            stroke={SOLD_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCanvas>
      <PriceByYearTable data={rows} />
    </ChartPanel>
  );
}

function PriceByMileageChart({ data }: { data: Charts["priceByMileageBucket"] }) {
  const rows = withAskingRange(
    data.filter(
      (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
    ),
  );
  if (rows.length === 0) {
    return <EmptyChart title="Price by mileage" message="No mileage and price data for these filters." />;
  }

  return (
    <ChartPanel title="Price by mileage" meta="25,000 km groups · model year can affect the result" legend>
      <ChartCanvas>
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Price by mileage"
          desc="Median price and asking-price middle 50 percent by 25,000 kilometre mileage bucket"
        >
          <ChartGrid />
          <XAxis
            dataKey="bucketStartKm"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatKmCompact}
            minTickGap={34}
            {...axisProps}
          />
          <YAxis domain={["auto", "auto"]} tickFormatter={formatCurrencyCompact} width={72} {...axisProps} />
          <Tooltip content={(props) => <PriceTooltip {...props} formatLabel={formatKmBucket} />} />
          <Area
            type="monotone"
            dataKey="askingRange"
            name="Asking p25–p75"
            stroke="none"
            fill={ASKING_COLOR}
            fillOpacity={0.13}
            tooltipType="none"
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="medianAskingPriceEur"
            name="Median asking price"
            stroke={ASKING_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="medianObservedSoldPriceEur"
            name="Observed-sold listing price"
            stroke={SOLD_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCanvas>
      <PriceByMileageTable data={rows} />
    </ChartPanel>
  );
}

function PriceByTransmissionComparison({
  data,
  totalListings,
}: {
  data: Charts["priceByTransmission"];
  totalListings: number;
}) {
  const rows = data.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  if (rows.length === 0) {
    return <EmptyChart title="Transmission comparison" message="No transmission price data for these filters." full />;
  }
  const knownCount = data.reduce((sum, point) => sum + point.listingCount, 0);
  const maxAskingPrice = Math.max(
    1,
    ...rows.map((row) => row.medianAskingPriceEur ?? 0),
  );

  return (
    <ChartPanel
      title="Transmission comparison"
      meta={`${formatNumber(knownCount)} of ${formatNumber(totalListings)} listings include transmission data · vehicle mix can affect prices`}
      full
    >
      <div className="transmission-comparison" aria-label="Median asking price by transmission">
        {rows.map((row) => {
          const width = ((row.medianAskingPriceEur ?? 0) / maxAskingPrice) * 100;
          const style = { "--comparison-width": `${width}%` } as CSSProperties;
          return (
            <div className="transmission-row" key={row.transmission}>
              <div className="transmission-label">
                <strong>{row.transmission}</strong>
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
      <details className="chart-data">
        <summary>View exact transmission data</summary>
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                <th scope="col">Transmission</th>
                <th scope="col">Listings</th>
                <th scope="col">Median asking</th>
                <th scope="col">Middle 50%</th>
                <th scope="col">Median mileage</th>
                <th scope="col">Observed-sold price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transmission}>
                  <th scope="row">{row.transmission}</th>
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
    </ChartPanel>
  );
}

function PriceByYearTable({ data }: { data: Charts["priceByYear"] }) {
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

function PriceByMileageTable({ data }: { data: Charts["priceByMileageBucket"] }) {
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

function SampledValue({ value, sample }: { value: string; sample: number }) {
  return (
    <span className="sampled-value">
      {value}
      <small>{formatNumber(sample)} observations</small>
    </span>
  );
}

function ObservedListingsChart({ data }: { data: Charts["marketOverTime"] }) {
  if (data.length === 0) {
    return <EmptyChart title="Listings captured per period" message="No complete observation periods for these filters." full />;
  }

  return (
    <ChartPanel
      title="Listings captured per period"
      meta="Latest complete current and observed-sold listing set in each period · repeated observations are not sales"
      full
      activityLegend
    >
      <ChartCanvas>
        <ComposedChart
          data={withBucketTime(data)}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Listings captured per period"
          desc="Current, observed-sold, and first-observed listing counts from the latest complete observation set in each period"
        >
          <ChartGrid />
          <XAxis
            dataKey="bucketTime"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTimeAxis}
            minTickGap={32}
            {...axisProps}
          />
          <YAxis tickFormatter={formatNumberCompact} width={58} {...axisProps} />
          <Tooltip content={(props) => <CountTooltip {...props} />} />
          <Bar
            dataKey="activeCount"
            name="Current"
            stackId="availability"
            fill={ASKING_COLOR}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Bar
            dataKey="soldCount"
            name="Observed-sold listings"
            stackId="availability"
            fill={SOLD_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="newListingCount"
            name="First observed"
            stroke={COUNT_COLOR}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCanvas>
      <ActivityTable data={data} />
    </ChartPanel>
  );
}

function ChartPanel({
  title,
  meta,
  legend = false,
  activityLegend = false,
  full = false,
  children,
}: {
  title: string;
  meta?: string;
  legend?: boolean;
  activityLegend?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`chart-panel ${full ? "chart-panel-full" : ""}`}>
      <div className="chart-heading">
        <div>
          <h3>{title}</h3>
          {meta ? <p>{meta}</p> : null}
        </div>
        {activityLegend ? <ActivityLegend /> : legend ? <PriceLegend /> : null}
      </div>
      {children}
    </section>
  );
}

function PriceLegend() {
  return (
    <div className="chart-legend" aria-label="Chart legend">
      <span>
        <i className="legend-line legend-asking" /> Asking
      </span>
      <span>
        <i className="legend-line legend-sold" /> Observed-sold listing
      </span>
    </div>
  );
}

function ActivityLegend() {
  return (
    <div className="chart-legend" aria-label="Chart legend">
      <span>
        <i className="legend-bar legend-current" /> Current
      </span>
      <span>
        <i className="legend-bar legend-observed-sold" /> Observed-sold
      </span>
      <span>
        <i className="legend-line legend-first-observed" /> First observed
      </span>
    </div>
  );
}

function ActivityTable({ data }: { data: Charts["marketOverTime"] }) {
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
                <td>{formatNumber(row.activeCount)}</td>
                <td>{formatNumber(row.soldCount)}</td>
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

function ChartCanvas({ children }: { children: ReactNode }) {
  return (
    <div className="chart-canvas">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function EmptyChart({ title, message, full = false }: { title: string; message: string; full?: boolean }) {
  return (
    <ChartPanel title={title} full={full}>
      <div className="chart-empty">{message}</div>
    </ChartPanel>
  );
}

function PriceTooltip({
  active,
  payload,
  label,
  formatLabel,
}: TooltipContentProps & { formatLabel: (value: string | number) => string }) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = (payload[0]?.payload ?? {}) as ChartRow;

  return (
    <div className="chart-tooltip">
      <strong>{formatLabel(String(label ?? ""))}</strong>
      {payload
        .filter((entry) => entry.value !== null && entry.value !== undefined && entry.type !== "none")
        .map((entry) => {
          const asking = entry.dataKey === "medianAskingPriceEur";
          const sample = asking ? row.askingPriceSampleSize : row.observedSoldPriceSampleSize;
          return (
            <div key={String(entry.dataKey)}>
              <span>
                <i style={{ background: entry.color }} /> {entry.name}
              </span>
              <b>{formatCurrency(Number(entry.value))}</b>
              {typeof sample === "number" ? <small>n={formatNumber(sample)}</small> : null}
            </div>
          );
        })}
      {typeof row.askingPriceP25Eur === "number" && typeof row.askingPriceP75Eur === "number" ? (
        <p>
          Asking p25–p75: {formatCurrency(row.askingPriceP25Eur)}–{formatCurrency(row.askingPriceP75Eur)}
        </p>
      ) : null}
      {typeof row.medianYearModel === "number" ? <p>Median model year: {row.medianYearModel}</p> : null}
      {typeof row.medianMileageKm === "number" ? <p>Median mileage: {formatKm(row.medianMileageKm)}</p> : null}
    </div>
  );
}

function CountTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="chart-tooltip">
      <strong>{formatObservedDate(String(label ?? ""))}</strong>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)}>
          <span>
            <i style={{ background: entry.color }} /> {entry.name}
          </span>
          <b>{formatNumber(Number(entry.value ?? 0))}</b>
        </div>
      ))}
    </div>
  );
}

function ChartGrid({ vertical = false }: { vertical?: boolean }) {
  return <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={vertical} />;
}

const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: AXIS_COLOR, fontSize: 11 },
} as const;

function withAskingRange<
  T extends { askingPriceP25Eur: number | null; askingPriceP75Eur: number | null },
>(data: T[]) {
  return data.map((row) => ({
    ...row,
    askingRange:
      row.askingPriceP25Eur !== null && row.askingPriceP75Eur !== null
        ? [row.askingPriceP25Eur, row.askingPriceP75Eur]
        : null,
  }));
}

function withBucketTime<T extends { bucket: string }>(data: T[]) {
  return data.map((row) => ({ ...row, bucketTime: new Date(`${row.bucket}T00:00:00`).getTime() }));
}

function formatTimeAxis(value: number) {
  return new Intl.DateTimeFormat("fi-FI", { month: "short", year: "2-digit" }).format(
    new Date(value),
  );
}

function formatObservedDate(value: string | number) {
  const numericValue = Number(value);
  const date = Number.isFinite(numericValue) ? new Date(numericValue) : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("fi-FI", { dateStyle: "medium" }).format(date);
}

function formatKmBucket(value: string | number) {
  return `${formatKmCompact(Number(value))}–${formatKmCompact(Number(value) + 24_999)}`;
}

function formatPriceRange(start: number | null, end: number | null) {
  return start === null || end === null ? "–" : `${formatCurrency(start)}–${formatCurrency(end)}`;
}

function formatCurrencyCompact(value: number) {
  return `${formatNumberCompact(value)} €`;
}

function formatKmCompact(value: number) {
  return `${formatNumberCompact(value)} km`;
}

function formatNumberCompact(value: number) {
  return new Intl.NumberFormat("fi-FI", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
