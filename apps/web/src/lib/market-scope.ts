import { singleSearchParam as single, type WebSearchParams } from "./url-filter-navigation";

export function selectedFilterLabels(params: WebSearchParams, variant: "analytics" | "listings") {
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
    ["Body style", single(params.bodyType)],
    ["Activity", single(params.activity) === "firstObserved" ? "First observed in latest 7 days" : single(params.activity) === "priceReduced" ? "Price reduced in latest 7 days" : ""],
    ["Seller", single(params.sellerType)],
    ...(variant === "analytics"
      ? ([
          ["Observed from", single(params.from)],
          ["Observed to", single(params.to)],
          ["Interval", intervalLabel(single(params.interval))],
        ] as Array<[string, string]>)
      : ([
          ["Sort", sortLabel(single(params.sort))],
        ] as Array<[string, string]>)),
  ];
  return entries.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
}

function availabilityLabel(value: string) {
  if (value === "all") return "Current + sold";
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
    firstSeenDesc: "First observed recently",
    lastSeenDesc: "Last observed recently",
    priceReductionDesc: "Largest recorded price reduction",
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
