import { comparisonIdsSchema, savedStateSchema, type SavedState as StoredState } from "@nettiauto/schemas";
export type SavedState = StoredState & { shortlist: StoredState["cars"] };
export const EMPTY_SAVED = '{"cars":[],"shortlist":[],"searches":[]}';
export function parseSavedState(value: string): SavedState {
  try {
    const parsed = savedStateSchema.safeParse(JSON.parse(value));
    return parsed.success ? { ...parsed.data, shortlist: parsed.data.shortlist ?? parsed.data.cars } : { cars: [], shortlist: [], searches: [] };
  } catch {
    return { cars: [], shortlist: [], searches: [] };
  }
}
export function compareHref(ids: string[], view: { reference?: string; differences?: boolean } = {}) {
  const selected = [...new Set(ids)].slice(0, 4);
  if (!selected.length) return "/compare";
  const params = new URLSearchParams({ ids: selected.join(",") });
  if (view.reference && selected.includes(view.reference)) params.set("reference", view.reference);
  if (view.differences && selected.length > 1) params.set("differences", "1");
  return `/compare?${params}`;
}
export function parseCompareIds(value: string | string[] | undefined) {
  if (typeof value !== "string") return [];
  const parsed = comparisonIdsSchema.safeParse(value.split(","));
  return parsed.success ? [...new Set(parsed.data)] : null;
}
