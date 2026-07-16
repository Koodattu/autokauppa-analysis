"use client";

import { lazy, Suspense, type ReactNode } from "react";
import type { AnalyticsSnapshotResponse, AnalyticsTimeSeriesResponse } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import {
  ActivityTable,
  ChartLoadingCanvas,
  ChartPanel,
  EmptyChart,
  HistoricalPriceTable,
  PriceByMileageTable,
  PriceByYearTable,
  TransmissionComparison,
  TransmissionTable,
} from "./analytics-chart-semantics";
import { DeferredRender } from "./deferred-render";

const HistoricalPriceVisual = lazy(() =>
  import("./analytics-charts").then((module) => ({ default: module.HistoricalPriceVisual })),
);

const PriceByYearVisual = lazy(() =>
  import("./analytics-charts").then((module) => ({ default: module.PriceByYearVisual })),
);

const PriceByMileageVisual = lazy(() =>
  import("./analytics-charts").then((module) => ({ default: module.PriceByMileageVisual })),
);

const MarketActivityVisual = lazy(() =>
  import("./analytics-charts").then((module) => ({ default: module.MarketActivityVisual })),
);

export function LazyHistoricalPriceChart({ data }: { data: AnalyticsTimeSeriesResponse["marketOverTime"] }) {
  const pricePoints = data.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  if (pricePoints.length < 2) {
    return (
      <ChartPanel title="Price over observed time" full>
        <div className="chart-empty">At least two observed periods are needed for a price trend.</div>
        {data.length > 0 ? <HistoricalPriceTable data={data} /> : null}
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title="Price over observed time"
      meta="Median price in each observed period · observed-sold values are listing evidence, not confirmed transactions"
      full
      legend
    >
      <DeferredChartVisual label="price chart">
        <HistoricalPriceVisual data={data} />
      </DeferredChartVisual>
      <HistoricalPriceTable data={data} />
    </ChartPanel>
  );
}

export function LazyAnalyticsSnapshotCharts({ analytics }: { analytics: AnalyticsSnapshotResponse }) {
  const yearRows = analytics.charts.priceByYear.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  const mileageRows = analytics.charts.priceByMileageBucket.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  const transmissionRows = analytics.charts.priceByTransmission.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  const knownTransmissionCount = analytics.charts.priceByTransmission.reduce(
    (sum, point) => sum + point.listingCount,
    0,
  );

  return (
    <section className="analytics-grid" aria-label="Market charts">
      {yearRows.length === 0 ? (
        <EmptyChart title="Price by model year" message="No model-year price data for these filters." />
      ) : (
        <ChartPanel
          title="Price by model year"
          meta="Asking-price middle 50% shown as a band · compare similar mileage where possible"
          legend
          rangeLegend
        >
          <DeferredChartVisual label="model-year price chart">
            <PriceByYearVisual data={yearRows} />
          </DeferredChartVisual>
          <PriceByYearTable data={yearRows} />
        </ChartPanel>
      )}
      {mileageRows.length === 0 ? (
        <EmptyChart title="Price by mileage" message="No mileage and price data for these filters." />
      ) : (
        <ChartPanel
          title="Price by mileage"
          meta="25,000 km groups · model year can affect the result"
          legend
          rangeLegend
        >
          <DeferredChartVisual label="mileage price chart">
            <PriceByMileageVisual data={mileageRows} />
          </DeferredChartVisual>
          <PriceByMileageTable data={mileageRows} />
        </ChartPanel>
      )}
      {transmissionRows.length === 0 ? (
        <EmptyChart title="Transmission comparison" message="No transmission price data for these filters." full />
      ) : (
        <ChartPanel
          title="Transmission comparison"
          meta={`${formatNumber(knownTransmissionCount)} of ${formatNumber(analytics.summary.listingCount)} listings include transmission data · vehicle mix can affect prices`}
          full
        >
          <TransmissionComparison data={transmissionRows} />
          <TransmissionTable data={transmissionRows} />
        </ChartPanel>
      )}
    </section>
  );
}

export function LazyMarketActivityChart({ data }: { data: AnalyticsTimeSeriesResponse["marketOverTime"] }) {
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
      <DeferredChartVisual label="listing-activity chart">
        <MarketActivityVisual data={data} />
      </DeferredChartVisual>
      <ActivityTable data={data} />
    </ChartPanel>
  );
}

export function ChartPlaceholder({ title, full = true }: { title: string; full?: boolean }) {
  return (
    <section
      className={`chart-panel chart-loading ${full ? "chart-panel-full" : ""}`}
      role="status"
      aria-busy="true"
      aria-label={`Loading ${title.toLowerCase()}`}
    >
      <h3>{title}</h3>
      <div className="skeleton-block" aria-hidden="true" />
    </section>
  );
}

function DeferredChartVisual({ label, children }: { label: string; children: ReactNode }) {
  const fallback = <ChartLoadingCanvas label={label} />;
  return (
    <DeferredRender fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </DeferredRender>
  );
}
