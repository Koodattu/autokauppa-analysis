"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { PublicListingDetailResponse } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatDate, formatKm, formatMonthDay } from "@/lib/format";

type HistoryRow = PublicListingDetailResponse["history"][number];

export function ListingHistoryChart({ history }: { history: HistoryRow[] }) {
  const hasValues = history.some(
    (row) => row.askingPriceEur !== null || row.observedSoldPriceEur !== null || row.mileageKm !== null,
  );
  if (history.length < 2 || !hasValues) {
    return null;
  }

  return (
    <div className="history-visual">
      <div className="history-legend" aria-label="History chart legend">
        <span><i className="history-line history-asking" aria-hidden="true" /> Asking price</span>
        <span><i className="history-line history-sold" aria-hidden="true" /> Observed-sold listing price</span>
        <span><i className="history-line history-mileage" aria-hidden="true" /> Mileage</span>
        <small>Left axis: price · right axis: mileage</small>
      </div>
      <div className="history-chart" aria-label="Listing price on the left axis and mileage on the right axis by observation date">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history}
            margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
            title="Listing history"
            desc="Asking price, price shown on an observed-sold listing, and mileage by observation date"
          >
          <CartesianGrid stroke="var(--public-chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="observedAt"
            tickFormatter={formatShortDate}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tick={{ fill: "var(--public-chart-axis)", fontSize: 11 }}
          />
          <YAxis
            yAxisId="price"
            domain={["auto", "auto"]}
            tickFormatter={formatCompactCurrency}
            axisLine={false}
            tickLine={false}
            width={68}
            tick={{ fill: "var(--public-chart-axis)", fontSize: 11 }}
          />
          <YAxis
            yAxisId="mileage"
            orientation="right"
            tickFormatter={formatCompactKm}
            axisLine={false}
            tickLine={false}
            width={62}
            tick={{ fill: "var(--public-chart-axis)", fontSize: 11 }}
          />
          <Tooltip content={(props) => <HistoryTooltip {...props} />} />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey="askingPriceEur"
            name="Asking price"
            stroke="var(--public-chart-asking)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "white", stroke: "var(--public-chart-asking)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey="observedSoldPriceEur"
            name="Observed-sold listing price"
            stroke="var(--public-chart-sold)"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={{ r: 3, fill: "var(--public-chart-sold)", stroke: "var(--public-chart-sold)", strokeWidth: 1 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="mileage"
            type="stepAfter"
            dataKey="mileageKm"
            name="Mileage"
            stroke="var(--public-chart-history)"
            strokeWidth={1.8}
            strokeDasharray="2 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HistoryTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const row = (payload[0]?.payload ?? {}) as HistoryRow;
  return (
    <div className="chart-tooltip">
      <strong>Observed {formatDate(String(label ?? ""))}</strong>
      {payload
        .filter((entry) => entry.value !== null && entry.value !== undefined)
        .map((entry) => (
          <div key={String(entry.dataKey)}>
            <span>
              <i style={{ background: entry.color }} /> {entry.name}
            </span>
            <b>
              {entry.dataKey === "mileageKm"
                ? formatKm(Number(entry.value))
                : formatCurrency(Number(entry.value))}
            </b>
          </div>
        ))}
      {row.sourceUpdatedDate ? <p>Updated on source: {formatDate(row.sourceUpdatedDate)}</p> : null}
    </div>
  );
}

function formatShortDate(value: string) {
  return formatMonthDay(value);
}

function formatCompactCurrency(value: number) {
  return `${compact(value)} €`;
}

function formatCompactKm(value: number) {
  return `${compact(value)} km`;
}

function compact(value: number) {
  return formatCompactNumber(value);
}
