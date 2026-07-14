"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { singleSearchParam as single, type FilterMetadata } from "@/lib/api";

export type PageSearchParams = Record<string, string | string[] | undefined>;

type MarketFilterFormProps = {
  action: "/" | "/listings";
  filters: FilterMetadata;
  params: PageSearchParams;
  variant: "analytics" | "listings";
};

export function MarketFilterForm({ action, filters, params, variant }: MarketFilterFormProps) {
  const router = useRouter();
  const initialMake = single(params.make);
  const initialModel = single(params.model);
  const [selectedMake, setSelectedMake] = useState(initialMake);
  const [selectedModel, setSelectedModel] = useState(initialModel);
  const [models, setModels] = useState(filters.models);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const modelRequest = useRef(0);
  const advancedCount = countAdvancedFilters(params, variant);

  async function selectMake(make: string) {
    const request = modelRequest.current + 1;
    modelRequest.current = request;
    setSelectedMake(make);
    setSelectedModel("");

    if (!make) {
      setModels([]);
      setModelsLoading(false);
      return;
    }
    if (make === initialMake) {
      setModels(filters.models);
      setModelsLoading(false);
      return;
    }

    setModels([]);
    setModelsLoading(true);
    try {
      const query = new URLSearchParams({ make });
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api"}/filters?${query.toString()}`,
      );
      if (!response.ok) {
        throw new Error("Model options request failed.");
      }
      const metadata = (await response.json()) as FilterMetadata;
      if (modelRequest.current === request) {
        setModels(metadata.models);
      }
    } catch {
      if (modelRequest.current === request) {
        setModels([]);
      }
    } finally {
      if (modelRequest.current === request) {
        setModelsLoading(false);
      }
    }
  }

  return (
    <form
      className="filter-surface"
      action={action}
      method="get"
      aria-busy={isPending}
      onSubmit={(event) => {
        const href = cleanFilterHref(event, action);
        startTransition(() => router.push(href));
      }}
    >
      <div className={`primary-filters ${variant === "listings" ? "with-sort" : ""}`}>
        <FilterField label="Make">
          <select name="make" value={selectedMake} onChange={(event) => void selectMake(event.target.value)}>
            <option value="">All makes</option>
            {filters.makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Model">
          <select
            name="model"
            value={selectedModel}
            disabled={!selectedMake || modelsLoading}
            onChange={(event) => setSelectedModel(event.target.value)}
          >
            <option value="">
              {modelsLoading ? "Loading models…" : selectedMake ? "All models" : "Choose a make first"}
            </option>
            {models.map((model) => (
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
        <FilterField label="Availability">
          <select name="availability" defaultValue={single(params.availability) || "all"}>
            <option value="all">Current + sold</option>
            <option value="current">Current</option>
            <option value="sold">Sold</option>
          </select>
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
        <button type="submit" disabled={isPending}>
          {isPending ? "Updating…" : variant === "analytics" ? "Analyze" : "Apply"}
        </button>
      </div>

      <details className="advanced-filters" open={advancedCount > 0}>
        <summary>
          <span>Advanced filters</span>
          {advancedCount > 0 ? <span className="filter-count">{advancedCount}</span> : null}
        </summary>
        <div className="advanced-filter-grid">
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
          <FilterField label="Price from (€)">
            <input name="priceMin" type="number" inputMode="numeric" defaultValue={single(params.priceMin)} />
          </FilterField>
          <FilterField label="Price to (€)">
            <input name="priceMax" type="number" inputMode="numeric" defaultValue={single(params.priceMax)} />
          </FilterField>
          <FilterField label="Mileage from (km)">
            <input
              name="mileageMin"
              type="number"
              inputMode="numeric"
              defaultValue={single(params.mileageMin)}
            />
          </FilterField>
          <FilterField label="Mileage to (km)">
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

function cleanFilterHref(event: FormEvent<HTMLFormElement>, action: string) {
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
  return value ? `${action}?${value}` : action;
}
