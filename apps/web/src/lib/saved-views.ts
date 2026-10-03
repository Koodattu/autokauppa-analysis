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
export function compareHref(ids: string[]) {
  return `/compare?${new URLSearchParams({ ids: [...new Set(ids)].slice(0, 4).join(",") })}`;
}
export function parseCompareIds(value: string | string[] | undefined) {
  if (typeof value !== "string") return [];
  const parsed = comparisonIdsSchema.safeParse(value.split(","));
  return parsed.success ? [...new Set(parsed.data)] : null;
}
