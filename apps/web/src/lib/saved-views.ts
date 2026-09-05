import { z } from "zod";

export const savedStateSchema = z.object({
  cars: z.array(z.object({ id: z.string().uuid(), title: z.string().max(200) })).max(4),
  searches: z.array(z.object({ title: z.string().max(120), href: z.string().max(6000).refine((href) =>
    /^\/(analyze|listings)(\?|$)/.test(href) && !href.includes("\\") && !href.includes("#")) })).max(12),
});
export type SavedState = z.infer<typeof savedStateSchema>;
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
  const parsed = z.array(z.string().uuid()).min(1).max(4).safeParse(value.split(","));
  return parsed.success ? [...new Set(parsed.data)] : null;
}
