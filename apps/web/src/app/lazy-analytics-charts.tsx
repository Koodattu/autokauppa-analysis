"use client";

import dynamic from "next/dynamic";
import type { AnalyticsSnapshotResponse, AnalyticsTimeSeriesResponse } from "@/lib/api";

const HistoricalPriceChart = dynamic(
  () => import("./analytics-charts").then((module) => module.HistoricalPriceChart),
  { ssr: false, loading: () => <ChartPlaceholder title="Price over observed time" /> },
);

const AnalyticsSnapshotCharts = dynamic(
  () => import("./analytics-charts").then((module) => module.AnalyticsSnapshotCharts),
  { ssr: false, loading: () => <SnapshotChartsPlaceholder /> },
);

const MarketActivityChart = dynamic(
  () => import("./analytics-charts").then((module) => module.MarketActivityChart),
  { ssr: false, loading: () => <ChartPlaceholder title="Listings captured per period" /> },
);

export function LazyHistoricalPriceChart({ data }: { data: AnalyticsTimeSeriesResponse["marketOverTime"] }) {
  return <HistoricalPriceChart data={data} />;
}

export function LazyAnalyticsSnapshotCharts({ analytics }: { analytics: AnalyticsSnapshotResponse }) {
  return <AnalyticsSnapshotCharts analytics={analytics} />;
}

export function LazyMarketActivityChart({ data }: { data: AnalyticsTimeSeriesResponse["marketOverTime"] }) {
  return <MarketActivityChart data={data} />;
}

export function ChartPlaceholder({ title, full = true }: { title: string; full?: boolean }) {
  return (
    <section className={`chart-panel chart-loading ${full ? "chart-panel-full" : ""}`} aria-busy="true">
      <h2>{title}</h2>
      <div className="skeleton-block" />
    </section>
  );
}

function SnapshotChartsPlaceholder() {
  return (
    <section className="analytics-grid" aria-busy="true" aria-label="Loading market comparisons">
      <ChartPlaceholder title="Price by model year" full={false} />
      <ChartPlaceholder title="Price by mileage" full={false} />
      <ChartPlaceholder title="Transmission comparison" />
    </section>
  );
}
