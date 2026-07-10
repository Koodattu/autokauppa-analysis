"use client";

import type { ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
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
import type { AnalyticsTrendResponse } from "@/lib/api";
import { formatCurrency, formatKm, formatNumber } from "@/lib/format";

type Charts = AnalyticsTrendResponse["charts"];
type ChartRow = Record<string, unknown>;

const ASKING_COLOR = "#0f766e";
const SOLD_COLOR = "#b45309";
const COUNT_COLOR = "#334155";
const GRID_COLOR = "#e5e7eb";
const AXIS_COLOR = "#667085";

export function AnalyticsCharts({ analytics }: { analytics: AnalyticsTrendResponse }) {
  return (
    <section className="analytics-grid" aria-label="Market charts">
      <PriceOverTimeChart data={analytics.charts.marketOverTime} />
      <PriceByYearChart data={analytics.charts.priceByYear} />
      <PriceByMileageChart data={analytics.charts.priceByMileageBucket} />
      <PriceByTransmissionChart
        data={analytics.charts.priceByTransmission}
        totalListings={analytics.summary.listingCount}
      />
      <ObservedListingsChart data={analytics.charts.marketOverTime} />
    </section>
  );
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
      meta="Median price in each observed period"
      full
      legend
    >
      <ChartCanvas>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Price over observed time"
          desc="Median asking and observed sold prices by observation period"
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
            name="Median observed sold price"
            stroke={SOLD_COLOR}
            strokeWidth={2.5}
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
    <ChartPanel title="Price by model year" meta="Asking-price middle 50% shown as a band" legend>
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
            name="Median observed sold price"
            stroke={SOLD_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCanvas>
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
    <ChartPanel title="Price by mileage" meta="25,000 km buckets · model year can affect the result" legend>
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
            name="Median observed sold price"
            stroke={SOLD_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 3, strokeWidth: 2, fill: "white" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartCanvas>
    </ChartPanel>
  );
}

function PriceByTransmissionChart({
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
    return <EmptyChart title="Price by transmission" message="No transmission price data for these filters." />;
  }
  const knownCount = data.reduce((sum, point) => sum + point.listingCount, 0);

  return (
    <ChartPanel
      title="Price by transmission"
      meta={`${formatNumber(knownCount)} of ${formatNumber(totalListings)} listings have transmission data`}
      legend
    >
      <div className="chart-canvas" style={{ height: Math.max(280, rows.length * 52) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
            title="Price by transmission"
            desc="Median asking and observed sold price grouped by transmission"
          >
            <ChartGrid vertical />
            <XAxis type="number" tickFormatter={formatCurrencyCompact} {...axisProps} />
            <YAxis type="category" dataKey="transmission" width={108} {...axisProps} />
            <Tooltip content={(props) => <PriceTooltip {...props} formatLabel={String} />} />
            <Bar
              dataKey="medianAskingPriceEur"
              name="Median asking price"
              fill={ASKING_COLOR}
              radius={[0, 5, 5, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
            <Bar
              dataKey="medianObservedSoldPriceEur"
              name="Median observed sold price"
              fill={SOLD_COLOR}
              radius={[0, 5, 5, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}

function ObservedListingsChart({ data }: { data: Charts["marketOverTime"] }) {
  if (data.length === 0) {
    return <EmptyChart title="Listings observed over time" message="No observed listing periods for these filters." />;
  }

  return (
    <ChartPanel title="Listings observed over time" meta="Listings seen in each period · not a point-in-time inventory">
      <ChartCanvas>
        <ComposedChart
          data={withBucketTime(data)}
          margin={{ top: 8, right: 12, bottom: 4, left: 6 }}
          title="Listings observed over time"
          desc="Current, sold, and first-observed listing counts by observation period"
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
            name="Sold"
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
    </ChartPanel>
  );
}

function ChartPanel({
  title,
  meta,
  legend = false,
  full = false,
  children,
}: {
  title: string;
  meta?: string;
  legend?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`chart-panel ${full ? "chart-panel-full" : ""}`}>
      <div className="chart-heading">
        <div>
          <h2>{title}</h2>
          {meta ? <p>{meta}</p> : null}
        </div>
        {legend ? <PriceLegend /> : null}
      </div>
      {children}
    </section>
  );
}

function PriceLegend() {
  return (
    <div className="chart-legend" aria-label="Chart legend">
      <span>
        <i style={{ background: ASKING_COLOR }} /> Asking
      </span>
      <span>
        <i style={{ background: SOLD_COLOR }} /> Observed sold
      </span>
    </div>
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
