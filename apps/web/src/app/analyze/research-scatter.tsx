"use client";
import Link from "next/link";
import { useState } from "react";
import type { ResearchResponse } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatKm } from "@/lib/format";

export function PriceMileagePlot({ data }: { data: ResearchResponse }) {
  const [selected, setSelected] = useState<ResearchResponse["points"][number] | null>(null);
  const maxKm = Math.max(1, ...data.points.map((point) => point.mileage));
  const maxPrice = Math.max(1, ...data.points.map((point) => point.price));
  if (!data.points.length) return <p>No listings with both mileage and price.</p>;
  return <><p>A consistent sample of {data.points.length} listings with mileage, from {data.summary.count} priced listings. Select a point for its recorded values.</p>
    <svg viewBox="0 0 640 310" className="research-scatter" role="group" aria-label="Price versus mileage; exact sampled values are available below">
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1="65" x2="620" y1={255 - fraction * 220} y2={255 - fraction * 220} stroke="var(--public-chart-grid)" /><text x="58" y={259 - fraction * 220} textAnchor="end">{formatCompactNumber(Math.round(maxPrice * fraction))} €</text><text x={65 + fraction * 540} y="285" textAnchor="middle">{formatCompactNumber(Math.round(maxKm * fraction))}</text></g>)}
      <text x="335" y="307" textAnchor="middle">Mileage (km)</text>
      {data.points.map((point) => <circle key={point.listingId} cx={65 + point.mileage / maxKm * 540} cy={255 - point.price / maxPrice * 220} r={selected?.listingId === point.listingId ? 7 : 4} fill="var(--accent)" opacity="0.65" role="button" tabIndex={0} aria-label={`${formatCurrency(point.price)}, ${formatKm(point.mileage)}, model year ${point.year ?? "unknown"}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(point); } }} onClick={() => setSelected(point)}><title>{formatCurrency(point.price)} · {formatKm(point.mileage)} · {point.year ?? "Year unknown"}</title></circle>)}
    </svg>
    {selected && <p className="research-note">Recorded in this view: <strong>{formatCurrency(selected.price)}</strong> · {formatKm(selected.mileage)} · model year {selected.year ?? "unknown"}. <Link href={`/listings/${selected.listingId}`} target="_blank">Open latest listing details ↗</Link></p>}
    <details className="chart-data"><summary>Exact sampled points</summary><div className="chart-table-wrap"><table className="chart-table"><thead><tr><th scope="col">Model year</th><th scope="col">Mileage</th><th scope="col">Price</th><th scope="col">Inspect</th></tr></thead><tbody>{data.points.map((point) => <tr key={point.listingId}><td>{point.year ?? "Unknown"}</td><td>{formatKm(point.mileage)}</td><td>{formatCurrency(point.price)}</td><td><button className="secondary-button" onClick={() => setSelected(point)}>Select point</button></td></tr>)}</tbody></table></div></details>
  </>;
}
