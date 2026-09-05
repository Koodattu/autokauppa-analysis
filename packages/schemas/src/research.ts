import { z } from "zod";
import { listingTableItemResponseSchema, coverageMetadataResponseSchema } from "./product-api";

const count = z.number().int().nonnegative();
const number = z.number().nullable();
const distribution = z.object({ count, median: number, p25: number, p75: number }).strict();
export const researchResponseSchema = z.object({
  mode: z.enum(["current", "historical"]),
  coverage: coverageMetadataResponseSchema,
  observedFrom: z.string().nullable(),
  observedTo: z.string().nullable(),
  historyFrom: z.string().nullable(),
  historyTo: z.string().nullable(),
  summary: distribution.extend({ medianMileage: number, medianYear: number }),
  fields: z.object({ mileage: count, year: count, fuel: count, transmission: count, body: count }).strict(),
  priceBands: z.array(z.object({ from: z.number(), to: number, count }).strict()),
  yearMileage: z.array(distribution.extend({ year: z.number(), mileageFrom: z.number() })),
  fuels: z.array(distribution.extend({ label: z.string(), medianMileage: number, medianYear: number })),
  transmissions: z.array(distribution.extend({ label: z.string(), medianMileage: number, medianYear: number })),
  bodies: z.array(distribution.extend({ label: z.string(), medianMileage: number, medianYear: number })),
  models: z.array(distribution.extend({ make: z.string(), model: z.string() })),
  evidence: z.array(listingTableItemResponseSchema),
  points: z.array(z.object({ listingId: z.string().uuid(), year: number, mileage: z.number(), price: z.number() }).strict()),
  evidencePage: count,
  evidencePages: count,
}).strict();
export type ResearchResponse = z.infer<typeof researchResponseSchema>;

export const datasetOverviewResponseSchema = z.object({
  current: count, archived: count, median: number, p25: number, p75: number,
  firstObserved: count, reduced: count, updatedAt: z.string().nullable(),
  historyFrom: z.string().nullable(), historyTo: z.string().nullable(),
  activityFrom: z.string().nullable(),
}).strict();
export type DatasetOverviewResponse = z.infer<typeof datasetOverviewResponseSchema>;
export const listingLookupResponseSchema = z.object({ listingId: z.string().uuid() }).strict();
