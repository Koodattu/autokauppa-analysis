"use client";
import Link from "next/link";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import type { ResearchResponse } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatKm } from "@/lib/format";
import { researchListingHref } from "@/lib/research-navigation";
import type { WebSearchParams } from "@/lib/url-filter-navigation";

export function PriceMileagePlot({ data, params = {} }: { data: ResearchResponse; params?: WebSearchParams }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.points.find((point) => point.listingId === selectedId);
  const points = [...data.points].sort((a, b) => a.mileage - b.mileage || a.price - b.price);
  const maxKm = Math.max(1, ...data.points.map((point) => point.mileage));
  const maxPrice = Math.max(1, ...data.points.map((point) => point.price));
  if (!data.points.length) return <p>No listings with both mileage and price.</p>;
  function navigate(event: KeyboardEvent<SVGCircleElement>, index: number) {
    let next = index;
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": next = (index + 1) % points.length; break;
      case "ArrowLeft": case "ArrowUp": next = (index + points.length - 1) % points.length; break;
      case "Home": next = 0; break;
      case "End": next = points.length - 1; break;
      case "Enter": case " ": break;
      default: return;
    }
    event.preventDefault();
    setSelectedId(points[next].listingId);
    event.currentTarget.ownerSVGElement?.querySelectorAll<SVGCircleElement>("circle")[next]?.focus();
  }

  function selectNearest(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    let closestDistance = 22;
    let closest = null;
    for (const point of points) {
      const x = bounds.left + point.mileage / maxKm * bounds.width;
      const y = bounds.bottom - point.price / maxPrice * bounds.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);
      if (distance <= closestDistance) {
        closest = point;
        closestDistance = distance;
      }
    }
    if (closest) setSelectedId(closest.listingId);
  }

  return <><p>A consistent sample of {points.length} listings with mileage, from {data.summary.count} priced listings. Tap a point or use the arrow keys to inspect a listing.</p>
    <div className="scatter-frame"><svg className="research-scatter" role="radiogroup" aria-label="Price versus mileage, ordered by mileage" onClick={selectNearest}>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction} aria-hidden="true">
        <line x1="0" x2="100%" y1={`${100 - fraction * 100}%`} y2={`${100 - fraction * 100}%`} stroke="var(--public-chart-grid)" />
        <text x="-8" y={`${100 - fraction * 100}%`} dy="4" textAnchor="end">{formatCompactNumber(Math.round(maxPrice * fraction))} €</text>
        <text className={fraction === 0.25 || fraction === 0.75 ? "scatter-minor-tick" : undefined} x={`${fraction * 100}%`} y="100%" dy="21" textAnchor="middle">{formatCompactNumber(Math.round(maxKm * fraction))}</text>
      </g>)}
      <text x="50%" y="100%" dy="42" textAnchor="middle" aria-hidden="true">Mileage (km)</text>
      {points.map((point, index) => {
        const checked = selected?.listingId === point.listingId;
        return <circle key={point.listingId} cx={`${point.mileage / maxKm * 100}%`} cy={`${100 - point.price / maxPrice * 100}%`}
          r={checked ? 6 : 4} role="radio" tabIndex={checked || (!selected && index === 0) ? 0 : -1} aria-checked={checked}
          aria-label={`${formatCurrency(point.price)}, ${formatKm(point.mileage)}, model year ${point.year ?? "unknown"}`}
          onKeyDown={(event) => navigate(event, index)} onClick={(event) => { event.stopPropagation(); setSelectedId(point.listingId); }}>
          <title>{`${formatCurrency(point.price)} · ${formatKm(point.mileage)} · ${point.year ?? "Year unknown"}`}</title>
        </circle>;
      })}
    </svg></div>
    {selected && <p className="research-note" role="status">Recorded in this view: <strong>{formatCurrency(selected.price)}</strong> · {formatKm(selected.mileage)} · model year {selected.year ?? "unknown"}. <Link href={researchListingHref(selected.listingId, params)} target="_blank">Open latest listing details ↗</Link></p>}
    <details className="chart-data"><summary>Exact sampled points</summary><div className="chart-table-wrap"><table className="chart-table"><thead><tr><th scope="col">Model year</th><th scope="col">Mileage</th><th scope="col">Price</th><th scope="col">Inspect</th></tr></thead><tbody>{data.points.map((point) => <tr key={point.listingId}><td>{point.year ?? "Unknown"}</td><td>{formatKm(point.mileage)}</td><td>{formatCurrency(point.price)}</td><td><button className="secondary-button" aria-pressed={selectedId === point.listingId} onClick={() => setSelectedId(point.listingId)}>Select point</button></td></tr>)}</tbody></table></div></details>
  </>;
}
