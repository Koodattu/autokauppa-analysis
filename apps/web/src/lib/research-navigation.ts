import { listingSearchUrlFilter } from "@nettiauto/schemas";
import type { WebSearchParams } from "./url-filter-navigation";

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

export function researchHref(params: WebSearchParams, changes: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  query.delete("page");
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) query.delete(key); else query.set(key, String(value));
  }
  return `/analyze?${query}`;
}

export function cloneComparisonHref(params: WebSearchParams) {
  const primary = researchQuery(params);
  if (!primary.ok) return "/analyze";
  const changes: Record<string, string> = { comparing: "1" };
  for (const [key, value] of listingSearchUrlFilter.format(primary.query)) {
    if (key !== "page") changes[`compare${key[0].toUpperCase()}${key.slice(1)}`] = value;
  }
  return researchHref(params, changes);
}

export function comparisonParams(params: WebSearchParams): WebSearchParams {
  const parsed = researchQuery(params, true);
  return parsed.ok ? Object.fromEntries(listingSearchUrlFilter.format(parsed.query)) : {};
}
