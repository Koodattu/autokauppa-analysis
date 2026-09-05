import { comparisonIdsSchema, savedStateSchema, type SavedState } from "@nettiauto/schemas";
export type { SavedState } from "@nettiauto/schemas";
export const EMPTY_SAVED = '{"cars":[],"searches":[]}';
export function parseSavedState(value: string): SavedState {
  try {
    const parsed = savedStateSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : { cars: [], searches: [] };
  } catch {
    return { cars: [], searches: [] };
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
