"use client";

import type { ReactNode } from "react";
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
import type { AnalyticsTrendResponse } from "@/lib/api";
import {
  formatCompactNumber,
  formatCurrency,
  formatKm,
  formatMonthYear,
  formatNumber,
} from "@/lib/format";
import {
  formatKmBucket,
  formatObservedDate,
} from "./analytics-chart-semantics";

type Charts = AnalyticsTrendResponse["charts"];
type ChartRow = Record<string, unknown>;

const ASKING_COLOR = "var(--public-chart-asking)";
const SOLD_COLOR = "var(--public-chart-sold)";
const COUNT_COLOR = "var(--public-chart-count)";
const GRID_COLOR = "var(--public-chart-grid)";
const AXIS_COLOR = "var(--public-chart-axis)";

export function HistoricalPriceVisual({ data }: { data: Charts["marketOverTime"] }) {
  const rows = withBucketTime(data);
  return (
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
  );
}

export function PriceByYearVisual({ data }: { data: Charts["priceByYear"] }) {
  const rows = withAskingRange(data);
  return (
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
            stroke={ASKING_COLOR}
            strokeOpacity={0.78}
            strokeWidth={1.5}
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
  );
}

export function PriceByMileageVisual({ data }: { data: Charts["priceByMileageBucket"] }) {
  const rows = withAskingRange(data);
  return (
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
            stroke={ASKING_COLOR}
            strokeOpacity={0.78}
            strokeWidth={1.5}
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
  );
}

export function MarketActivityVisual({ data }: { data: Charts["marketOverTime"] }) {
  return (
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
  return data.map((row) => ({ ...row, bucketTime: new Date(`${row.bucket}T12:00:00Z`).getTime() }));
}

function formatTimeAxis(value: number) {
  return formatMonthYear(value);
}

function formatCurrencyCompact(value: number) {
  return `${formatNumberCompact(value)} €`;
}

function formatKmCompact(value: number) {
  return `${formatNumberCompact(value)} km`;
}

function formatNumberCompact(value: number) {
  return formatCompactNumber(value);
}
