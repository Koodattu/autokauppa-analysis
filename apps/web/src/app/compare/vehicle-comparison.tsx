"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PublicListingDetailResponse } from "@/lib/api";
import { compareHref } from "@/lib/saved-views";
import { ContinueComparison, ShareLink } from "../saved-workspace";
import { formatCurrency, formatListingPrice, formatDate, formatKm, labelAvailability } from "@/lib/format";

export function VehicleComparison({ cars }: { cars: PublicListingDetailResponse[] }) {
  const params = useSearchParams();
  if (!cars.length) return null;
  const differences = cars.length > 1 && params.get("differences") === "1";
  const baseline = cars.find((car) => car.listing.listingId === params.get("reference")) ?? cars[0];
  const reference = baseline.listing.listingId;
  const ids = cars.map((car) => car.listing.listingId);
  const href = compareHref(ids, { reference, differences });
  function updateView(view: { reference?: string; differences?: boolean }) {
    window.history.pushState(null, "", compareHref(ids, { reference, differences, ...view }));
  }
  const rows: Array<[string, (car: PublicListingDetailResponse) => string]> = [
    ["Price", (car) => formatListingPrice(car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur)],
    ["Difference from reference", (car) => {
      if (car.listing.availability !== baseline.listing.availability) return "Different price types";
      const price = car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur;
      const referencePrice = baseline.listing.askingPriceEur ?? baseline.listing.observedSoldPriceEur;
      if (price === null || price <= 0 || referencePrice === null || referencePrice <= 0) return "Prices not recorded";
      const difference = price - referencePrice;
      return `${difference > 0 ? "+" : ""}${formatCurrency(difference)}`;
    }],
    ["Availability", (car) => labelAvailability(car.listing.availability)],
    ["Model year", (car) => String(car.listing.yearModel ?? "Unknown")],
    ["Mileage", (car) => formatKm(car.listing.mileageKm)],
    ["Fuel", (car) => car.vehicleDetails?.fuelTypeSourceLabel ?? "Unknown"],
    ["Transmission", (car) => car.vehicleDetails?.transmissionSourceLabel ?? "Unknown"],
    ["Body style", (car) => car.vehicleDetails?.bodyTypeSourceLabel ?? "Unknown"],
    ["Engine", (car) => car.vehicleDetails?.engineSourceLabel ?? "Unknown"],
    ["Drivetrain", (car) => car.vehicleDetails?.drivetrainSourceLabel ?? "Unknown"],
    ["Power", (car) => car.vehicleDetails?.powerKw == null ? "Unknown" : `${car.vehicleDetails.powerKw} kW`],
    ["Location", (car) => car.vehicleDetails?.sourceLocationLabel ?? "Unknown"],
    ["Seller", (car) => car.listing.seller ?? "Unknown"],
    ["Office fee", (car) => formatCurrency(car.vehicleDetails?.officeFeeEur ?? null)],
    ["First observed", (car) => formatDate(car.listing.firstSeenAt)],
    ["Last observed", (car) => formatDate(car.listing.lastSeenAt)],
    ["Recorded price changes", (car) => String(car.marketContext.recordedPriceChangeCount)],
    ["Comparable median", (car) => `${formatCurrency(car.marketContext.medianPriceEur)} (${car.marketContext.sampleSize} prices)`],
  ];
  const visibleRows = rows.filter(([, value]) => !differences || new Set(cars.map(value)).size > 1);
  return <section className="panel" id="car-comparison"><div className="comparison-controls"><label><input type="checkbox" checked={differences} disabled={cars.length < 2} onChange={(e) => updateView({ differences: e.target.checked })} /> Show differences only</label>
    <label>Reference car <select value={reference} onChange={(e) => updateView({ reference: e.target.value })}>{cars.map((car) => <option key={car.listing.listingId} value={car.listing.listingId}>{car.listing.make} {car.listing.model} {car.listing.yearModel} · {formatListingPrice(car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur)}</option>)}</select></label>
    <ShareLink href={href} /></div>
    <ContinueComparison cars={cars.map((car) => ({ id: car.listing.listingId, title: `${car.listing.make} ${car.listing.model} ${car.listing.yearModel ?? ""}`.trim().slice(0, 200) }))} />
    {cars.length === 1 && <p>Choose another car to compare. All recorded details are shown for this car.</p>}
    {cars.length > 2 && <p className="muted comparison-scroll-hint">Scroll the table sideways to compare all {cars.length} cars. Detail labels stay visible.</p>}
    <div className="chart-table-wrap" role="region" aria-label="Car comparison table" tabIndex={0}><table className="chart-table vehicle-comparison" style={cars.length > 2 ? { minWidth: 110 + cars.length * 150 } : undefined}>
      <colgroup><col className="comparison-label-column" />{cars.map((car) => <col key={car.listing.listingId} />)}</colgroup>
      <thead><tr><th scope="col">Detail</th>{cars.map((car) => <th scope="col" key={car.listing.listingId}><Link className="comparison-car-title" href={`/listings/${car.listing.listingId}?returnTo=${encodeURIComponent(`${href}#car-comparison`)}`}>{car.listing.make} {car.listing.model} {car.listing.yearModel}</Link>{car.listing.listingId === reference && <small className="comparison-reference">Reference</small>}
        <Link className="comparison-remove" aria-label={`Remove ${car.listing.make} ${car.listing.model} ${car.listing.yearModel} from this comparison`}
          href={`${compareHref(ids.filter((id) => id !== car.listing.listingId), { reference, differences })}${cars.length > 1 ? "#car-comparison" : ""}`}>Remove</Link>
      </th>)}</tr></thead>
    <tbody>{visibleRows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{cars.map((car) => <td key={car.listing.listingId}>{value(car)}</td>)}</tr>)}
      {visibleRows.length === 0 && <tr><td colSpan={cars.length + 1}><p>No recorded differences in these fields. Missing details may still differ.</p><button className="secondary-button" onClick={() => updateView({ differences: false })}>Show all details</button></td></tr>}
    </tbody></table></div>
    <EquipmentComparison cars={cars} differences={differences} showAll={() => updateView({ differences: false })} />
    <p className="muted">Each car’s market comparison uses its own peer group. Sold listing prices are not transaction prices. Removing a car from this view keeps your saved cars and selection.</p>
  </section>;
}

function EquipmentComparison({ cars, differences, showAll }: {
  cars: PublicListingDetailResponse[];
  differences: boolean;
  showAll: () => void;
}) {
  const equipment = cars.map((car) => new Set(car.vehicleDetails?.equipmentGroups.flatMap((group) => group.items) ?? []));
  const allItems = [...new Set(equipment.flatMap((items) => [...items]))].sort();
  const items = allItems.filter((item) => !differences || !equipment.every((car) => car.has(item)));
  if (!allItems.length) return <p className="muted">No equipment recorded for these cars.</p>;
  return <details className="chart-data comparison-equipment">
    <summary>Compare recorded equipment · {items.length} {differences ? (items.length === 1 ? "difference" : "differences") : (items.length === 1 ? "item" : "items")}</summary>
    <p className="muted">Source equipment labels are shown as recorded. Not recorded does not mean absent; check the original listing.</p>
    {items.length ? <div className="chart-table-wrap" role="region" aria-label="Equipment comparison table" tabIndex={0}>
      <table className="chart-table vehicle-comparison" aria-label="Recorded equipment comparison" style={cars.length > 2 ? { minWidth: 110 + cars.length * 150 } : undefined}>
        <colgroup><col className="comparison-label-column" />{cars.map((car) => <col key={car.listing.listingId} />)}</colgroup>
        <thead><tr><th scope="col">Equipment</th>{cars.map((car) => <th scope="col" key={car.listing.listingId}>{car.listing.make} {car.listing.model} {car.listing.yearModel}</th>)}</tr></thead>
        <tbody>{items.map((item) => <tr key={item}><th scope="row">{item}</th>{cars.map((car, index) => <td key={car.listing.listingId} className={equipment[index].has(item) ? "equipment-recorded" : "muted"}>{equipment[index].has(item) ? "Recorded" : "Not recorded"}</td>)}</tr>)}</tbody>
      </table>
    </div> : <p>No recorded equipment differences. <button className="secondary-button" onClick={showAll}>Show all equipment</button></p>}
  </details>;
}
