import { z } from "zod";

export const savedStateSchema = z.object({
  cars: z.array(z.object({ id: z.string().uuid(), title: z.string().max(200) })).max(4),
  searches: z.array(z.object({ title: z.string().max(120), href: z.string().max(6000).refine((href) =>
    /^\/(analyze|listings)(\?|$)/.test(href) && !href.includes("\\") && !href.includes("#")) })).max(12),
});

export type SavedState = z.infer<typeof savedStateSchema>;
export const comparisonIdsSchema = z.array(z.string().uuid()).min(1).max(4);
