import { listingSearchUrlFilter } from "@nettiauto/schemas";
import { formatPageFilters, type WebSearchParams } from "./url-filter-navigation";

export function researchQuery(params: WebSearchParams, comparison = false) {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (comparison && key.startsWith("compare") && key.length > 7) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) values.append(key[7].toLowerCase() + key.slice(8), item);
    } else if (!comparison && !key.startsWith("compar")) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) values.append(key, item);
    }
  }
  if (!values.has("availability")) values.set("availability", "current");
  return listingSearchUrlFilter.parse(values);
}

export function researchHref(params: WebSearchParams, changes: Record<string, string | number | undefined> = {}, comparison = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  query.delete(comparison ? "comparePage" : "page");
  for (const [key, value] of Object.entries(changes)) {
    const target = comparison ? `compare${key[0].toUpperCase()}${key.slice(1)}` : key;
    if (value === undefined) query.delete(target); else query.set(target, String(value));
  }
  return `/analyze?${query}`;
}

export function cloneComparisonHref(params: WebSearchParams) {
  const primary = researchQuery(params);
  if (!primary.ok) return "/analyze";
  const changes: Record<string, string> = { comparing: "1" };
  for (const [key, value] of formatPageFilters(primary.query)) {
    if (key !== "page") changes[`compare${key[0].toUpperCase()}${key.slice(1)}`] = value;
  }
  const primaryParams = Object.fromEntries(Object.entries(params).filter(([key]) => !key.startsWith("compar")));
  return researchHref(primaryParams, changes);
}

export function comparisonParams(params: WebSearchParams): WebSearchParams {
  const parsed = researchQuery(params, true);
  return parsed.ok ? Object.fromEntries(formatPageFilters(parsed.query)) : {};
}

export function swapResearchHref(params: WebSearchParams) {
  const primary = researchQuery(params);
  const comparison = researchQuery(params, true);
  if (!primary.ok || !comparison.ok) return "/analyze";
  const next = formatPageFilters(comparison.query);
  next.set("comparing", "1");
  for (const [key, value] of formatPageFilters(primary.query)) {
    next.set(`compare${key[0].toUpperCase()}${key.slice(1)}`, value);
  }
  return `/analyze?${next}#primary-research`;
}

export function researchListingHref(id: string, params: WebSearchParams, comparison = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const returnTo = `/analyze?${query}#${comparison ? "comparison" : "research"}-evidence`;
  return `/listings/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(returnTo)}`;
}
