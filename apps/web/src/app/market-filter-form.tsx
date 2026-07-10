"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { singleSearchParam as single, type FilterMetadata } from "@/lib/api";

export type PageSearchParams = Record<string, string | string[] | undefined>;

type MarketFilterFormProps = {
  action: "/" | "/listings";
  filters: FilterMetadata;
  params: PageSearchParams;
  variant: "analytics" | "listings";
};

export function MarketFilterForm({ action, filters, params, variant }: MarketFilterFormProps) {
  const advancedCount = countAdvancedFilters(params, variant);

  return (
    <form
      className="filter-surface"
      action={action}
      method="get"
      onSubmit={(event) => submitCleanFilterForm(event, action)}
    >
      <div className={`primary-filters ${variant === "listings" ? "with-sort" : ""}`}>
        <FilterField label="Make">
          <select name="make" defaultValue={single(params.make)}>
            <option value="">All makes</option>
            {filters.makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Model">
          <select name="model" defaultValue={single(params.model)}>
            <option value="">All models</option>
            {filters.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Model year">
          <input
            name="modelYear"
            type="number"
            inputMode="numeric"
            min={filters.yearRange.min ?? 1886}
            max={filters.yearRange.max ?? 2100}
            defaultValue={single(params.modelYear)}
            placeholder="Any year"
          />
        </FilterField>
        {variant === "listings" ? (
          <FilterField label="Sort">
            <select name="sort" defaultValue={single(params.sort) || "lastSeenDesc"}>
              <option value="lastSeenDesc">Recently observed</option>
              <option value="sourceUpdatedDesc">Recently updated</option>
              <option value="priceAsc">Lowest price</option>
              <option value="priceDesc">Highest price</option>
              <option value="mileageAsc">Lowest mileage</option>
              <option value="mileageDesc">Highest mileage</option>
              <option value="yearDesc">Newest model year</option>
            </select>
          </FilterField>
        ) : null}
        <button type="submit">{variant === "analytics" ? "Analyze" : "Apply"}</button>
      </div>

      <details className="advanced-filters" open={advancedCount > 0}>
        <summary>
          <span>Advanced filters</span>
          {advancedCount > 0 ? <span className="filter-count">{advancedCount}</span> : null}
        </summary>
        <div className="advanced-filter-grid">
          <FilterField label="Availability">
            <select name="availability" defaultValue={single(params.availability) || "all"}>
              <option value="all">Current + sold</option>
              <option value="current">Current</option>
              <option value="sold">Sold</option>
            </select>
          </FilterField>
          <FilterField label="Year from">
            <input
              name="modelYearFrom"
              type="number"
              inputMode="numeric"
              defaultValue={single(params.modelYearFrom)}
            />
          </FilterField>
          <FilterField label="Year to">
            <input
              name="modelYearTo"
              type="number"
              inputMode="numeric"
              defaultValue={single(params.modelYearTo)}
            />
          </FilterField>
          <FilterField label="Price from">
            <input name="priceMin" type="number" inputMode="numeric" defaultValue={single(params.priceMin)} />
          </FilterField>
          <FilterField label="Price to">
            <input name="priceMax" type="number" inputMode="numeric" defaultValue={single(params.priceMax)} />
          </FilterField>
          <FilterField label="Mileage from">
            <input
              name="mileageMin"
              type="number"
              inputMode="numeric"
              defaultValue={single(params.mileageMin)}
            />
          </FilterField>
          <FilterField label="Mileage to">
            <input
              name="mileageMax"
              type="number"
              inputMode="numeric"
              defaultValue={single(params.mileageMax)}
            />
          </FilterField>
          <FilterField label="Transmission">
            <select name="transmission" defaultValue={single(params.transmission)}>
              <option value="">Any transmission</option>
              {filters.transmissions.map((transmission) => (
                <option key={transmission} value={transmission}>
                  {transmission}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Seller">
            <select name="sellerType" defaultValue={single(params.sellerType)}>
              <option value="">Any seller</option>
              {filters.sellerTypes.map((sellerType) => (
                <option key={sellerType} value={sellerType}>
                  {sellerType}
                </option>
              ))}
            </select>
          </FilterField>
          {variant === "analytics" ? (
            <>
              <FilterField label="Trend from">
                <input name="from" type="date" defaultValue={single(params.from)} />
              </FilterField>
              <FilterField label="Trend to">
                <input name="to" type="date" defaultValue={single(params.to)} />
              </FilterField>
              <FilterField label="Time interval">
                <select name="interval" defaultValue={single(params.interval) || "week"}>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </FilterField>
            </>
          ) : null}
        </div>
        <div className="advanced-actions">
          {variant === "analytics" ? (
            <span className="filter-help">Observed dates apply to time charts.</span>
          ) : null}
          <Link className="text-link" href={action}>
            Clear filters
          </Link>
        </div>
      </details>

    </form>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

function countAdvancedFilters(params: PageSearchParams, variant: MarketFilterFormProps["variant"]) {
  const keys = [
    "availability",
    "modelYearFrom",
    "modelYearTo",
    "priceMin",
    "priceMax",
    "mileageMin",
    "mileageMax",
    "transmission",
    "sellerType",
    ...(variant === "analytics" ? ["from", "to", "interval"] : []),
  ];
  return keys.filter((key) => {
    const value = single(params[key]);
    return value && value !== "all" && value !== "week";
  }).length;
}

function submitCleanFilterForm(event: FormEvent<HTMLFormElement>, action: string) {
  event.preventDefault();
  const query = new URLSearchParams();
  for (const [key, rawValue] of new FormData(event.currentTarget).entries()) {
    const value = String(rawValue).trim();
    if (!value || (key === "availability" && value === "all") || (key === "interval" && value === "week")) {
      continue;
    }
    if (key === "sort" && value === "lastSeenDesc") {
      continue;
    }
    query.set(key, value);
  }

  const value = query.toString();
  window.location.assign(value ? `${action}?${value}` : action);
}
