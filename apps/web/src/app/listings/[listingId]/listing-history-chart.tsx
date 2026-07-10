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
import { formatCurrency, formatDate, formatKm } from "@/lib/format";

type HistoryRow = PublicListingDetailResponse["history"][number];

export function ListingHistoryChart({ history }: { history: HistoryRow[] }) {
  const hasValues = history.some(
    (row) => row.askingPriceEur !== null || row.observedSoldPriceEur !== null || row.mileageKm !== null,
  );
  if (history.length < 2 || !hasValues) {
    return null;
  }

  return (
    <div className="history-chart" aria-label="Listing price and mileage history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={history}
          margin={{ top: 8, right: 8, bottom: 4, left: 8 }}
          title="Listing history"
          desc="Asking price, observed sold price, and mileage by observation date"
        >
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="observedAt"
            tickFormatter={formatShortDate}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tick={{ fill: "#667085", fontSize: 11 }}
          />
          <YAxis
            yAxisId="price"
            domain={["auto", "auto"]}
            tickFormatter={formatCompactCurrency}
            axisLine={false}
            tickLine={false}
            width={68}
            tick={{ fill: "#667085", fontSize: 11 }}
          />
          <YAxis
            yAxisId="mileage"
            orientation="right"
            tickFormatter={formatCompactKm}
            axisLine={false}
            tickLine={false}
            width={62}
            tick={{ fill: "#667085", fontSize: 11 }}
          />
          <Tooltip content={(props) => <HistoryTooltip {...props} />} />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey="askingPriceEur"
            name="Asking price"
            stroke="#0f766e"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "white", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="stepAfter"
            dataKey="observedSoldPriceEur"
            name="Observed sold price"
            stroke="#b45309"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "white", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="mileage"
            type="stepAfter"
            dataKey="mileageKm"
            name="Mileage"
            stroke="#475467"
            strokeWidth={1.8}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
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
      {row.sourceUpdatedDate ? <p>Updated on source: {formatDate(`${row.sourceUpdatedDate}T00:00:00`)}</p> : null}
    </div>
  );
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("fi-FI", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatCompactCurrency(value: number) {
  return `${compact(value)} €`;
}

function formatCompactKm(value: number) {
  return `${compact(value)} km`;
}

function compact(value: number) {
  return new Intl.NumberFormat("fi-FI", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
