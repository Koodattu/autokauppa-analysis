"use client";
import Link from "next/link";
import { useState } from "react";
import type { PublicListingDetailResponse } from "@/lib/api";
import { formatCurrency, formatDate, formatKm, labelAvailability } from "@/lib/format";

export function VehicleComparison({ cars }: { cars: PublicListingDetailResponse[] }) {
  const [differences, setDifferences] = useState(false);
  const [reference, setReference] = useState(cars[0]?.listing.listingId);
  if (!cars.length) return null;
  const baseline = cars.find((car) => car.listing.listingId === reference) ?? cars[0];
  const rows: Array<[string, (car: PublicListingDetailResponse) => string]> = [
    ["Price", (car) => formatCurrency(car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur)],
    ["Difference from reference", (car) => { if (car.listing.availability !== baseline.listing.availability) return "Different price types"; const a = car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur; const b = baseline.listing.askingPriceEur ?? baseline.listing.observedSoldPriceEur; return a !== null && b !== null ? `${a - b > 0 ? "+" : ""}${formatCurrency(a - b)}` : "Prices not recorded"; }],
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
    ["Equipment", (car) => car.vehicleDetails?.equipmentGroups.flatMap((group) => group.items).sort().join(" · ") || "Not recorded"],
  ];
  return <section className="panel"><div className="comparison-controls"><label><input type="checkbox" checked={differences} onChange={(e) => setDifferences(e.target.checked)} /> Show differences only</label>
    <label>Reference car <select value={reference} onChange={(e) => setReference(e.target.value)}>{cars.map((car) => <option key={car.listing.listingId} value={car.listing.listingId}>{car.listing.make} {car.listing.model} {car.listing.yearModel} · {formatCurrency(car.listing.askingPriceEur ?? car.listing.observedSoldPriceEur)}</option>)}</select></label></div>
    <div className="chart-table-wrap"><table className="chart-table vehicle-comparison"><thead><tr><th scope="col">Detail</th>{cars.map((car) => <th scope="col" key={car.listing.listingId}><Link href={`/listings/${car.listing.listingId}`}>{car.listing.make} {car.listing.model} {car.listing.yearModel}</Link></th>)}</tr></thead>
    <tbody>{rows.filter(([, value]) => !differences || new Set(cars.map(value)).size > 1).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{cars.map((car) => <td key={car.listing.listingId}>{value(car)}</td>)}</tr>)}</tbody></table></div>
    <p className="muted">Unknown equipment does not mean absent. Each car’s market comparison uses its own peer group. Sold listing prices are not transaction prices.</p>
  </section>;
}
