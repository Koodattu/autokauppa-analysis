import {
  analysisQueryUrlFilter,
  listingSearchUrlFilter,
  type ListingFiltersQuery,
} from "@nettiauto/schemas";

export type WebSearchParams = Record<string, string | string[] | undefined>;

export interface AnalysisRequestScope {
  readonly queryString: string;
  readonly snapshotQueryString: string;
  readonly filterMetadataQueryString: string;
}

export interface AnalysisNavigation extends AnalysisRequestScope {
  readonly listingsHref: string;
  readonly comparisonScope: AnalysisRequestScope | null;
  readonly comparisonClearHref: string;
  readonly primaryHiddenInputs: ReadonlyArray<readonly [name: string, value: string]>;
}

export interface ListingNavigation {
  readonly queryString: string;
  readonly filterMetadataQueryString: string;
  readonly analyticsHref: string;
  pageHref(page: number): string;
  detailHref(listingId: string): string;
}

const comparisonKeys = [
  "compareMake",
  "compareModel",
  "compareModelYear",
  "compareFuelType",
  "compareOptionsForMake",
] as const;

export function resolveAnalysisNavigation(
  params: WebSearchParams,
): AnalysisNavigation | null {
  const primaryParams = toUrlSearchParams(params);
  for (const key of comparisonKeys) {
    primaryParams.delete(key);
  }
  const parsed = analysisQueryUrlFilter.parse(primaryParams);
  if (!parsed.ok) {
    return null;
  }

  const scope = createAnalysisRequestScope(parsed.query);
  const listingQuery = analysisQueryUrlFilter.toListingSearch(parsed.query);
  const listingQueryString = listingSearchUrlFilter.format(listingQuery).toString();
  const comparisonScope = createComparisonScope(params, parsed.query);
  return {
    ...scope,
    listingsHref: routeWithQuery("/listings", listingQueryString),
    comparisonScope,
    comparisonClearHref: routeWithQuery("/", scope.queryString),
    primaryHiddenInputs: Array.from(new URLSearchParams(scope.queryString)),
  };
}

export function resolveListingNavigation(params: WebSearchParams): ListingNavigation | null {
  const parsed = listingSearchUrlFilter.parse(toUrlSearchParams(params));
  if (!parsed.ok) {
    return null;
  }

  const queryString = listingSearchUrlFilter.format(parsed.query).toString();
  const analysis = listingSearchUrlFilter.toAnalysisQuery(parsed.query);
  const analysisQueryString = analysisQueryUrlFilter.format(analysis).toString();
  return {
    queryString,
    filterMetadataQueryString: analysisQueryUrlFilter
      .formatForFilterMetadata(analysis)
      .toString(),
    analyticsHref: routeWithQuery("/", analysisQueryString),
    pageHref(page) {
      const next = listingSearchUrlFilter.withPage(parsed.query, page);
      return routeWithQuery("/listings", listingSearchUrlFilter.format(next).toString());
    },
    detailHref(listingId) {
      const returnTo = routeWithQuery("/listings", queryString);
      return `/listings/${encodeURIComponent(listingId)}?returnTo=${encodeURIComponent(returnTo)}`;
    },
  };
}

export function safeListingsReturnHref(value: string | string[] | undefined) {
  const rawPath = typeof value === "string" ? value.split(/[?#]/, 1)[0] : "";
  if (!value || Array.isArray(value) || rawPath !== "/listings" || value.includes("\\")) {
    return "/listings";
  }

  try {
    const base = "https://scope.invalid";
    const url = new URL(value, base);
    if (url.origin !== base || url.pathname !== "/listings" || url.hash) {
      return "/listings";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/listings";
  }
}

export function singleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function createComparisonScope(
  params: WebSearchParams,
  primary: ListingFiltersQuery,
): AnalysisRequestScope | null {
  const make = singleSearchParam(params.compareMake);
  if (!make) {
    return null;
  }

  const comparisonOptionsMatch = singleSearchParam(params.compareOptionsForMake) === make;
  const candidate = new URLSearchParams(analysisQueryUrlFilter.format(primary));
  for (const key of ["make", "model", "modelYear", "fuelType"]) {
    candidate.delete(key);
  }
  candidate.set("make", make);
  for (const [source, target] of [
    ["compareModel", "model"],
    ["compareModelYear", "modelYear"],
    ["compareFuelType", "fuelType"],
  ] as const) {
    const value = comparisonOptionsMatch ? singleSearchParam(params[source]) : "";
    if (value) {
      candidate.set(target, value);
    }
  }

  const parsed = analysisQueryUrlFilter.parse(candidate);
  return parsed.ok ? createAnalysisRequestScope(parsed.query) : null;
}

function createAnalysisRequestScope(query: ListingFiltersQuery): AnalysisRequestScope {
  const listingQuery = analysisQueryUrlFilter.toListingSearch(query);
  return {
    queryString: analysisQueryUrlFilter.format(query).toString(),
    snapshotQueryString: listingSearchUrlFilter.format(listingQuery).toString(),
    filterMetadataQueryString: analysisQueryUrlFilter.formatForFilterMetadata(query).toString(),
  };
}

function toUrlSearchParams(params: WebSearchParams) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          result.append(key, item);
        }
      }
    } else if (value) {
      result.set(key, value);
    }
  }
  return result;
}

function routeWithQuery(path: "/" | "/listings", queryString: string) {
  return queryString ? `${path}?${queryString}` : path;
}
