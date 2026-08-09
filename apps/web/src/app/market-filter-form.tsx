"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { analysisQueryUrlFilter, listingSearchUrlFilter } from "@nettiauto/schemas";
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
  const [modelsError, setModelsError] = useState("");
  const [modelStatus, setModelStatus] = useState("");
  const [formError, setFormError] = useState("");
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const modelRequest = useRef(0);
  const advancedCount = countAdvancedFilters(params, variant);
  const selectedCount = countSelectedFilters(params, variant);
  const selectedFilters = selectedFilterLabels(params, variant);
  const validationProps = (name: string) =>
    invalidFields.includes(name)
      ? { "aria-invalid": true as const, "aria-describedby": "filter-validation-error" }
      : {};

  async function selectMake(make: string) {
    const request = modelRequest.current + 1;
    modelRequest.current = request;
    setSelectedMake(make);
    setSelectedModel("");
    setModelsError("");
    setModelStatus(make ? `Loading models for ${make}.` : "");

    if (!make) {
      setModels([]);
      setModelsLoading(false);
      return;
    }
    if (make === initialMake) {
      setModels(filters.models);
      setModelsLoading(false);
      setModelStatus(`${filters.models.length} models available for ${make}.`);
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
        setModelStatus(`${metadata.models.length} models available for ${make}.`);
      }
    } catch {
      if (modelRequest.current === request) {
        setModels([]);
        const message = "Models couldn’t be loaded. Analyze the make as a whole or retry.";
        setModelsError(message);
        setModelStatus(message);
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
      onChange={() => {
        if (formError) {
          setFormError("");
        }
        if (invalidFields.length > 0) {
          setInvalidFields([]);
        }
      }}
      onSubmit={(event) => {
        const validation = validateFilterForm(event.currentTarget, variant);
        if (validation) {
          event.preventDefault();
          setFormError(validation.message);
          setInvalidFields(validation.fields);
          const firstInvalidField = event.currentTarget.elements.namedItem(validation.fields[0]);
          if (firstInvalidField instanceof HTMLElement) {
            firstInvalidField.focus();
          }
          return;
        }
        setFormError("");
        setInvalidFields([]);
        const href = cleanFilterHref(event, action);
        startTransition(() => router.push(href));
      }}
    >
      <div className="filter-surface-header">
        <div>
          <h2>{variant === "analytics" ? "Define the market" : "Narrow the listings"}</h2>
          <p>
            {variant === "analytics"
              ? "Start broad, then add only the details needed for your question."
              : "Use the same market scope as the analysis, then sort the evidence."}
          </p>
        </div>
        {selectedCount > 0 ? (
          <Link className="filter-reset" href={action}>
            Reset {selectedCount} {selectedCount === 1 ? "filter" : "filters"}
          </Link>
        ) : (
          <span className="filter-scope">All passenger cars</span>
        )}
      </div>

      {selectedFilters.length > 0 ? (
        <div className="applied-filter-row" aria-label="Applied market scope">
          <span>Applied scope</span>
          <ul>
            {selectedFilters.map((filter) => (
              <li key={filter}>{filter}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
            aria-busy={modelsLoading}
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
        <FilterField label="Exact model year">
          <input
            name="modelYear"
            type="number"
            inputMode="numeric"
            min={filters.yearRange.min ?? 1886}
            max={filters.yearRange.max ?? 2100}
            defaultValue={single(params.modelYear)}
            placeholder="Any year"
            {...validationProps("modelYear")}
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
        <div className="filter-submit">
          <button type="submit" disabled={isPending}>
            {isPending ? "Updating…" : variant === "analytics" ? "Analyze market" : "Show listings"}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {isPending ? "Updating the selected market" : ""}
          </span>
        </div>
      </div>

      <div
        className={modelsError ? "filter-error" : "sr-only"}
        id="model-options-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{modelStatus}</span>
        {modelsError ? (
          <button type="button" onClick={() => void selectMake(selectedMake)}>
            Retry
          </button>
        ) : null}
      </div>

      {formError ? (
        <p className="filter-error" id="filter-validation-error" role="alert">
          <span>{formError}</span>
        </p>
      ) : null}

      <details className="advanced-filters" open={advancedCount > 0}>
        <summary>
          <span>More ways to narrow</span>
          {advancedCount > 0 ? <span className="filter-count">{advancedCount}</span> : null}
        </summary>
        <div className="advanced-filter-groups">
          <fieldset className="filter-group">
            <legend>Vehicle range</legend>
            <p>Leave the year range empty when using an exact model year above.</p>
            <div className="filter-group-grid">
              <FilterField label="Year from">
                <input
                  name="modelYearFrom"
                  type="number"
                  inputMode="numeric"
                  min={filters.yearRange.min ?? 1886}
                  max={filters.yearRange.max ?? 2100}
                  defaultValue={single(params.modelYearFrom)}
                  {...validationProps("modelYearFrom")}
                />
              </FilterField>
              <FilterField label="Year to">
                <input
                  name="modelYearTo"
                  type="number"
                  inputMode="numeric"
                  min={filters.yearRange.min ?? 1886}
                  max={filters.yearRange.max ?? 2100}
                  defaultValue={single(params.modelYearTo)}
                  {...validationProps("modelYearTo")}
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
              <FilterField label="Fuel type">
                <select name="fuelType" defaultValue={single(params.fuelType)}>
                  <option value="">Any fuel type</option>
                  {filters.fuelTypes.map((fuelType) => (
                    <option key={fuelType} value={fuelType}>
                      {fuelType}
                    </option>
                  ))}
                </select>
              </FilterField>
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>Price and mileage</legend>
            <p>Use a minimum, maximum, or both.</p>
            <div className="filter-group-grid">
              <FilterField label="Price from (€)">
                <input
                  name="priceMin"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  defaultValue={single(params.priceMin)}
                  {...validationProps("priceMin")}
                />
              </FilterField>
              <FilterField label="Price to (€)">
                <input
                  name="priceMax"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  defaultValue={single(params.priceMax)}
                  {...validationProps("priceMax")}
                />
              </FilterField>
              <FilterField label="Mileage from (km)">
                <input
                  name="mileageMin"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  defaultValue={single(params.mileageMin)}
                  {...validationProps("mileageMin")}
                />
              </FilterField>
              <FilterField label="Mileage to (km)">
                <input
                  name="mileageMax"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  defaultValue={single(params.mileageMax)}
                  {...validationProps("mileageMax")}
                />
              </FilterField>
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>{variant === "analytics" ? "Observation window" : "Listing source"}</legend>
            <p>
              {variant === "analytics"
                ? "Dates apply to trend charts, not the current snapshot."
                : "Narrow by seller type when that distinction matters."}
            </p>
            <div className="filter-group-grid">
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
                    <input
                      name="from"
                      type="date"
                      defaultValue={single(params.from)}
                      {...validationProps("from")}
                    />
                  </FilterField>
                  <FilterField label="Trend to">
                    <input
                      name="to"
                      type="date"
                      defaultValue={single(params.to)}
                      {...validationProps("to")}
                    />
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
          </fieldset>
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
    "fuelType",
    "transmission",
    "sellerType",
    ...(variant === "analytics" ? ["from", "to", "interval"] : []),
  ];
  return keys.filter((key) => {
    const value = single(params[key]);
    return value && value !== "all" && value !== "week";
  }).length;
}

function countSelectedFilters(params: PageSearchParams, variant: MarketFilterFormProps["variant"]) {
  const keys = [
    "make",
    "model",
    "modelYear",
    "availability",
    "modelYearFrom",
    "modelYearTo",
    "priceMin",
    "priceMax",
    "mileageMin",
    "mileageMax",
    "fuelType",
    "transmission",
    "sellerType",
    ...(variant === "analytics" ? ["from", "to", "interval"] : ["sort"]),
  ];
  return keys.filter((key) => {
    const value = single(params[key]);
    return value && value !== "all" && value !== "week" && value !== "lastSeenDesc";
  }).length;
}

function selectedFilterLabels(params: PageSearchParams, variant: MarketFilterFormProps["variant"]) {
  const entries: Array<[string, string]> = [
    ["Make", single(params.make)],
    ["Model", single(params.model)],
    ["Exact year", single(params.modelYear)],
    ["Availability", availabilityLabel(single(params.availability))],
    ["Year from", single(params.modelYearFrom)],
    ["Year to", single(params.modelYearTo)],
    ["Price from", currencyFilterLabel(single(params.priceMin))],
    ["Price to", currencyFilterLabel(single(params.priceMax))],
    ["Mileage from", distanceFilterLabel(single(params.mileageMin))],
    ["Mileage to", distanceFilterLabel(single(params.mileageMax))],
    ["Fuel type", single(params.fuelType)],
    ["Transmission", single(params.transmission)],
    ["Seller", single(params.sellerType)],
    ...(variant === "analytics"
      ? ([
          ["Trend from", single(params.from)],
          ["Trend to", single(params.to)],
          ["Interval", intervalLabel(single(params.interval))],
        ] as Array<[string, string]>)
      : ([
          ["Sort", sortLabel(single(params.sort))],
        ] as Array<[string, string]>)),
  ];
  return entries.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
}

function availabilityLabel(value: string) {
  if (value === "current") {
    return "Current";
  }
  if (value === "sold") {
    return "Sold listings";
  }
  return "";
}

function intervalLabel(value: string) {
  if (!value || value === "week") {
    return "";
  }
  return value === "day" ? "Daily" : "Monthly";
}

function sortLabel(value: string) {
  const labels: Record<string, string> = {
    sourceUpdatedDesc: "Recently updated",
    priceAsc: "Lowest price",
    priceDesc: "Highest price",
    mileageAsc: "Lowest mileage",
    mileageDesc: "Highest mileage",
    yearDesc: "Newest model year",
  };
  return labels[value] ?? "";
}

function currencyFilterLabel(value: string) {
  return value ? `${value} €` : "";
}

function distanceFilterLabel(value: string) {
  return value ? `${value} km` : "";
}

function validateFilterForm(form: HTMLFormElement, variant: MarketFilterFormProps["variant"]) {
  const result = urlFilterFor(variant).parse(formSearchParams(form));
  if (result.ok) {
    return null;
  }

  return {
    message: result.issues[0]?.message ?? "Check the filter values and try again.",
    fields: [...new Set(result.issues.flatMap((issue) => issue.path.map(String)))],
  };
}

function cleanFilterHref(event: FormEvent<HTMLFormElement>, action: string) {
  event.preventDefault();
  const variant = action === "/listings" ? "listings" : "analytics";
  const result = urlFilterFor(variant).parse(formSearchParams(event.currentTarget));
  if (!result.ok) {
    return action;
  }
  const value = urlFilterFor(variant).format(result.query).toString();
  return value ? `${action}?${value}` : action;
}

function formSearchParams(form: HTMLFormElement) {
  const query = new URLSearchParams();
  for (const [key, rawValue] of new FormData(form).entries()) {
    const value = String(rawValue).trim();
    if (value) {
      query.set(key, value);
    }
  }
  return query;
}

function urlFilterFor(variant: MarketFilterFormProps["variant"]) {
  return variant === "listings" ? listingSearchUrlFilter : analysisQueryUrlFilter;
}
