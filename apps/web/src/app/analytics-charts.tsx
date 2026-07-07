import type { ReactNode } from "react";
import type { AnalyticsTrendResponse } from "@/lib/api";

type Charts = AnalyticsTrendResponse["charts"];
type MarketPoint = Charts["marketOverTime"][number];
type YearPoint = Charts["priceByYear"][number];
type MileageBucketPoint = Charts["priceByMileageBucket"][number];
type ScatterPoint = Charts["priceMileageScatter"][number];

const SVG_WIDTH = 720;
const SVG_HEIGHT = 300;
const PLOT = {
  top: 24,
  right: 22,
  bottom: 56,
  left: 70,
};
const PLOT_RIGHT = SVG_WIDTH - PLOT.right;
const PLOT_BOTTOM = SVG_HEIGHT - PLOT.bottom;
const PLOT_WIDTH = PLOT_RIGHT - PLOT.left;
const ASKING_COLOR = "#0f766e";
const SOLD_COLOR = "#b45309";
const NEW_COLOR = "#334155";
const GRID_COLOR = "#d9dee5";
const TEXT_COLOR = "#68717d";

export function AnalyticsCharts({ analytics }: { analytics: AnalyticsTrendResponse }) {
  return (
    <section className="analytics-grid" aria-label="Analytics charts">
      <PriceTrendChart data={analytics.charts.marketOverTime} />
      <InventoryChart data={analytics.charts.marketOverTime} />
      <YearPriceChart data={analytics.charts.priceByYear} />
      <MileagePriceChart data={analytics.charts.priceByMileageBucket} />
      <ScatterChart data={analytics.charts.priceMileageScatter} />
      <MakeBreakdownChart data={analytics.breakdowns.byMake} />
    </section>
  );
}

function PriceTrendChart({ data }: { data: MarketPoint[] }) {
  const asking = data.filter((point) => point.medianAskingPriceEur !== null);
  const sold = data.filter((point) => point.medianObservedSoldPriceEur !== null);
  const values = [
    ...asking.map((point) => point.medianAskingPriceEur ?? 0),
    ...sold.map((point) => point.medianObservedSoldPriceEur ?? 0),
  ];

  if (values.length === 0) {
    return <EmptyChart title="Price over time" message="No price trend data for these filters." />;
  }

  const yMax = niceMax(Math.max(...values));
  const askingPath = linePath(
    data
      .map((point, index) =>
        point.medianAskingPriceEur === null
          ? null
          : {
              x: xForIndex(index, data.length),
              y: yForValue(point.medianAskingPriceEur, yMax),
            },
      )
      .filter(isPoint),
  );
  const soldPath = linePath(
    data
      .map((point, index) =>
        point.medianObservedSoldPriceEur === null
          ? null
          : {
              x: xForIndex(index, data.length),
              y: yForValue(point.medianObservedSoldPriceEur, yMax),
            },
      )
      .filter(isPoint),
  );

  return (
    <ChartPanel
      title="Price over time"
      meta={`${formatNumber(totalSampleSize(data))} observed listings`}
      legend={[
        { label: "Asking Price", color: ASKING_COLOR },
        { label: "Observed Sold Price", color: SOLD_COLOR },
      ]}
    >
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        <title>Median Asking Price and Observed Sold Price over time</title>
        <Grid yMax={yMax} formatY={formatCurrencyCompact} />
        <XAxisLabels labels={data.map((point) => formatBucket(point.bucket))} />
        {askingPath ? <path className="chart-line" d={askingPath} stroke={ASKING_COLOR} /> : null}
        {soldPath ? <path className="chart-line" d={soldPath} stroke={SOLD_COLOR} /> : null}
        {data.map((point, index) =>
          point.medianAskingPriceEur === null ? null : (
            <circle
              key={`asking-${point.bucket}`}
              className="chart-dot"
              cx={xForIndex(index, data.length)}
              cy={yForValue(point.medianAskingPriceEur, yMax)}
              r="4"
              fill={ASKING_COLOR}
            />
          ),
        )}
        {data.map((point, index) =>
          point.medianObservedSoldPriceEur === null ? null : (
            <circle
              key={`sold-${point.bucket}`}
              className="chart-dot"
              cx={xForIndex(index, data.length)}
              cy={yForValue(point.medianObservedSoldPriceEur, yMax)}
              r="4"
              fill={SOLD_COLOR}
            />
          ),
        )}
      </svg>
    </ChartPanel>
  );
}

function InventoryChart({ data }: { data: MarketPoint[] }) {
  const maxCount = Math.max(...data.map((point) => Math.max(point.listingCount, point.newListingCount)), 0);
  if (data.length === 0 || maxCount === 0) {
    return <EmptyChart title="Inventory over time" message="No inventory trend data for these filters." />;
  }

  const yMax = niceMax(maxCount);
  const slotWidth = PLOT_WIDTH / Math.max(data.length, 1);
  const barWidth = Math.max(2, Math.min(18, slotWidth * 0.58));
  const newListingPath = linePath(
    data.map((point, index) => ({
      x: xForIndex(index, data.length),
      y: yForValue(point.newListingCount, yMax),
    })),
  );

  return (
    <ChartPanel
      title="Inventory over time"
      meta={`${formatNumber(data.at(-1)?.listingCount ?? 0)} latest bucket listings`}
      legend={[
        { label: "Current", color: ASKING_COLOR },
        { label: "Sold", color: SOLD_COLOR },
        { label: "New", color: NEW_COLOR },
      ]}
    >
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        <title>Current, sold, and new listings over time</title>
        <Grid yMax={yMax} formatY={formatNumberCompact} />
        <XAxisLabels labels={data.map((point) => formatBucket(point.bucket))} />
        {data.map((point, index) => {
          const x = xForIndex(index, data.length) - barWidth / 2;
          const activeHeight = PLOT_BOTTOM - yForValue(point.activeCount, yMax);
          const soldHeight = PLOT_BOTTOM - yForValue(point.soldCount, yMax);
          const soldY = PLOT_BOTTOM - activeHeight - soldHeight;

          return (
            <g key={point.bucket}>
              <rect
                className="chart-bar-bg"
                x={x}
                y={yForValue(point.listingCount, yMax)}
                width={barWidth}
                height={Math.max(1, PLOT_BOTTOM - yForValue(point.listingCount, yMax))}
                rx="3"
              />
              <rect
                x={x}
                y={PLOT_BOTTOM - activeHeight}
                width={barWidth}
                height={Math.max(0, activeHeight)}
                rx="3"
                fill={ASKING_COLOR}
              />
              <rect
                x={x}
                y={soldY}
                width={barWidth}
                height={Math.max(0, soldHeight)}
                rx="3"
                fill={SOLD_COLOR}
              />
            </g>
          );
        })}
        {newListingPath ? <path className="chart-line thin" d={newListingPath} stroke={NEW_COLOR} /> : null}
      </svg>
    </ChartPanel>
  );
}

function YearPriceChart({ data }: { data: YearPoint[] }) {
  const rows = data.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  const values = rows.flatMap((point) =>
    [
      point.askingPriceP25Eur,
      point.medianAskingPriceEur,
      point.askingPriceP75Eur,
      point.observedSoldPriceP25Eur,
      point.medianObservedSoldPriceEur,
      point.observedSoldPriceP75Eur,
    ].filter((value): value is number => value !== null),
  );

  if (rows.length === 0 || values.length === 0) {
    return <EmptyChart title="Price by model year" message="No model-year price data for these filters." />;
  }

  const yMax = niceMax(Math.max(...values));

  return (
    <ChartPanel
      title="Price by model year"
      meta={`${formatNumber(rows.reduce((sum, point) => sum + point.listingCount, 0))} listings`}
      legend={[
        { label: "Asking p25-p75", color: ASKING_COLOR },
        { label: "Observed Sold Price median", color: SOLD_COLOR },
      ]}
    >
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        <title>Asking Price range and Observed Sold Price median by model year</title>
        <Grid yMax={yMax} formatY={formatCurrencyCompact} />
        <XAxisLabels labels={rows.map((point) => String(point.yearModel))} />
        {rows.map((point, index) => (
          <g key={point.yearModel}>{renderRangePoint(point, xForIndex(index, rows.length), yMax)}</g>
        ))}
      </svg>
    </ChartPanel>
  );
}

function MileagePriceChart({ data }: { data: MileageBucketPoint[] }) {
  const rows = data.filter(
    (point) => point.medianAskingPriceEur !== null || point.medianObservedSoldPriceEur !== null,
  );
  const values = rows.flatMap((point) =>
    [point.medianAskingPriceEur, point.medianObservedSoldPriceEur].filter(
      (value): value is number => value !== null,
    ),
  );

  if (rows.length === 0 || values.length === 0) {
    return <EmptyChart title="Price by mileage" message="No mileage price data for these filters." />;
  }

  const yMax = niceMax(Math.max(...values));
  const askingPath = linePath(
    rows
      .map((point, index) =>
        point.medianAskingPriceEur === null
          ? null
          : {
              x: xForIndex(index, rows.length),
              y: yForValue(point.medianAskingPriceEur, yMax),
            },
      )
      .filter(isPoint),
  );
  const soldPath = linePath(
    rows
      .map((point, index) =>
        point.medianObservedSoldPriceEur === null
          ? null
          : {
              x: xForIndex(index, rows.length),
              y: yForValue(point.medianObservedSoldPriceEur, yMax),
            },
      )
      .filter(isPoint),
  );

  return (
    <ChartPanel
      title="Price by mileage"
      meta={`${formatKmCompact(rows[0]?.bucketStartKm ?? 0)}-${formatKmCompact(rows.at(-1)?.bucketEndKm ?? 0)}`}
      legend={[
        { label: "Asking Price", color: ASKING_COLOR },
        { label: "Observed Sold Price", color: SOLD_COLOR },
      ]}
    >
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        <title>Median Asking Price and Observed Sold Price by mileage bucket</title>
        <Grid yMax={yMax} formatY={formatCurrencyCompact} />
        <XAxisLabels labels={rows.map((point) => formatKmCompact(point.bucketStartKm))} />
        {askingPath ? <path className="chart-line" d={askingPath} stroke={ASKING_COLOR} /> : null}
        {soldPath ? <path className="chart-line" d={soldPath} stroke={SOLD_COLOR} /> : null}
        {rows.map((point, index) =>
          point.medianAskingPriceEur === null ? null : (
            <circle
              key={`asking-mileage-${point.bucketStartKm}`}
              className="chart-dot"
              cx={xForIndex(index, rows.length)}
              cy={yForValue(point.medianAskingPriceEur, yMax)}
              r="3.5"
              fill={ASKING_COLOR}
            />
          ),
        )}
        {rows.map((point, index) =>
          point.medianObservedSoldPriceEur === null ? null : (
            <circle
              key={`sold-mileage-${point.bucketStartKm}`}
              className="chart-dot"
              cx={xForIndex(index, rows.length)}
              cy={yForValue(point.medianObservedSoldPriceEur, yMax)}
              r="3.5"
              fill={SOLD_COLOR}
            />
          ),
        )}
      </svg>
    </ChartPanel>
  );
}

function ScatterChart({ data }: { data: ScatterPoint[] }) {
  const rows = data.filter((point) => priceForPoint(point) !== null);
  if (rows.length === 0) {
    return <EmptyChart title="Mileage versus price" message="No mileage and price pairs for these filters." />;
  }

  const xMax = niceMax(Math.max(...rows.map((point) => point.mileageKm)));
  const yMax = niceMax(Math.max(...rows.map((point) => priceForPoint(point) ?? 0)));
  const radius = rows.length > 300 ? 2.2 : 3.2;

  return (
    <ChartPanel
      title="Mileage versus price"
      meta={`${formatNumber(rows.length)} plotted listings`}
      legend={[
        { label: "Current", color: ASKING_COLOR },
        { label: "Sold", color: SOLD_COLOR },
      ]}
    >
      <svg className="chart-svg" viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img">
        <title>Listing Asking Price or Observed Sold Price compared with mileage</title>
        <Grid yMax={yMax} formatY={formatCurrencyCompact} />
        <NumericXAxisLabels max={xMax} format={formatKmCompact} />
        {rows.map((point) => {
          const price = priceForPoint(point);
          if (price === null) {
            return null;
          }

          return (
            <circle
              key={point.listingId}
              className="scatter-dot"
              cx={scale(point.mileageKm, 0, xMax, PLOT.left, PLOT_RIGHT)}
              cy={yForValue(price, yMax)}
              r={radius}
              fill={point.availability === "sold" ? SOLD_COLOR : ASKING_COLOR}
            />
          );
        })}
      </svg>
    </ChartPanel>
  );
}

function MakeBreakdownChart({ data }: { data: AnalyticsTrendResponse["breakdowns"]["byMake"] }) {
  if (data.length === 0) {
    return <EmptyChart title="Make mix" message="No make data for these filters." />;
  }

  const maxCount = Math.max(...data.map((row) => row.count), 1);
  return (
    <ChartPanel title="Make mix" meta={`${formatNumber(data.length)} groups`}>
      <div className="breakdown-bars">
        {data.map((row) => (
          <div key={row.make} className="breakdown-row">
            <span>{row.make}</span>
            <div className="breakdown-track">
              <span style={{ width: `${Math.max(4, (row.count / maxCount) * 100)}%` }} />
            </div>
            <strong>{formatNumber(row.count)}</strong>
          </div>
        ))}
      </div>
    </ChartPanel>
  );
}

function ChartPanel({
  title,
  meta,
  legend = [],
  children,
}: {
  title: string;
  meta?: string;
  legend?: Array<{ label: string; color: string }>;
  children: ReactNode;
}) {
  return (
    <section className="chart-panel">
      <div className="chart-heading">
        <div>
          <h2>{title}</h2>
          {meta ? <span>{meta}</span> : null}
        </div>
        {legend.length > 0 ? (
          <div className="chart-legend" aria-label={`${title} legend`}>
            {legend.map((item) => (
              <span key={item.label}>
                <i style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyChart({ title, message }: { title: string; message: string }) {
  return (
    <ChartPanel title={title}>
      <div className="chart-empty">{message}</div>
    </ChartPanel>
  );
}

function Grid({ yMax, formatY }: { yMax: number; formatY: (value: number) => string }) {
  const ticks = uniqueTicks([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(yMax * ratio)));
  return (
    <>
      {ticks.map((tick) => {
        const y = yForValue(tick, yMax);
        return (
          <g key={tick}>
            <line x1={PLOT.left} x2={PLOT_RIGHT} y1={y} y2={y} stroke={GRID_COLOR} />
            <text x={PLOT.left - 10} y={y + 4} textAnchor="end" fill={TEXT_COLOR}>
              {formatY(tick)}
            </text>
          </g>
        );
      })}
      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT_BOTTOM} stroke={GRID_COLOR} />
      <line
        x1={PLOT.left}
        x2={PLOT_RIGHT}
        y1={PLOT_BOTTOM}
        y2={PLOT_BOTTOM}
        stroke={GRID_COLOR}
      />
    </>
  );
}

function XAxisLabels({ labels }: { labels: string[] }) {
  const indexes = sampledIndexes(labels.length);
  return (
    <>
      {indexes.map((index) => (
        <text
          key={`${labels[index]}-${index}`}
          x={xForIndex(index, labels.length)}
          y={SVG_HEIGHT - 18}
          textAnchor="middle"
          fill={TEXT_COLOR}
        >
          {labels[index]}
        </text>
      ))}
    </>
  );
}

function NumericXAxisLabels({ max, format }: { max: number; format: (value: number) => string }) {
  const ticks = uniqueTicks([0, 0.5, 1].map((ratio) => Math.round(max * ratio)));
  return (
    <>
      {ticks.map((tick) => (
        <text
          key={tick}
          x={scale(tick, 0, max, PLOT.left, PLOT_RIGHT)}
          y={SVG_HEIGHT - 18}
          textAnchor="middle"
          fill={TEXT_COLOR}
        >
          {format(tick)}
        </text>
      ))}
    </>
  );
}

function renderRangePoint(point: YearPoint, x: number, yMax: number) {
  const askingMedian = point.medianAskingPriceEur;
  const soldMedian = point.medianObservedSoldPriceEur;

  return (
    <>
      {point.askingPriceP25Eur !== null && point.askingPriceP75Eur !== null ? (
        <line
          className="range-line"
          x1={x}
          x2={x}
          y1={yForValue(point.askingPriceP75Eur, yMax)}
          y2={yForValue(point.askingPriceP25Eur, yMax)}
          stroke={ASKING_COLOR}
        />
      ) : null}
      {askingMedian !== null ? (
        <circle className="chart-dot" cx={x} cy={yForValue(askingMedian, yMax)} r="4.5" fill={ASKING_COLOR} />
      ) : null}
      {soldMedian !== null ? (
        <circle
          className="chart-dot"
          cx={x + 7}
          cy={yForValue(soldMedian, yMax)}
          r="4"
          fill={SOLD_COLOR}
        />
      ) : null}
    </>
  );
}

function xForIndex(index: number, total: number) {
  if (total <= 1) {
    return PLOT.left + PLOT_WIDTH / 2;
  }

  return scale(index, 0, total - 1, PLOT.left, PLOT_RIGHT);
}

function yForValue(value: number, max: number) {
  return scale(value, 0, max, PLOT_BOTTOM, PLOT.top);
}

function scale(value: number, min: number, max: number, outputMin: number, outputMax: number) {
  if (max <= min) {
    return (outputMin + outputMax) / 2;
  }

  return outputMin + ((value - min) / (max - min)) * (outputMax - outputMin);
}

function linePath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return "";
  }

  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function isPoint(point: { x: number; y: number } | null): point is { x: number; y: number } {
  return point !== null;
}

function sampledIndexes(length: number) {
  if (length <= 6) {
    return Array.from({ length }, (_, index) => index);
  }

  const indexes = new Set<number>();
  for (let step = 0; step < 6; step += 1) {
    indexes.add(Math.round((step / 5) * (length - 1)));
  }

  return [...indexes].sort((a, b) => a - b);
}

function uniqueTicks(values: number[]) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function niceMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil((value * 1.08) / magnitude) * magnitude;
}

function priceForPoint(point: ScatterPoint) {
  return point.askingPriceEur ?? point.observedSoldPriceEur;
}

function totalSampleSize(data: MarketPoint[]) {
  return data.reduce((sum, point) => sum + point.sampleSize, 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fi-FI").format(value);
}

function formatNumberCompact(value: number) {
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  return formatNumber(value);
}

function formatCurrencyCompact(value: number) {
  if (value >= 1_000_000) {
    return `${Math.round(value / 100_000) / 10}M EUR`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k EUR`;
  }
  return `${formatNumber(value)} EUR`;
}

function formatKmCompact(value: number) {
  if (value >= 1_000) {
    return `${Math.round(value / 100) / 10}k km`;
  }
  return `${formatNumber(value)} km`;
}

function formatBucket(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "short",
  }).format(date);
}
