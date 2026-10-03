import Link from "next/link";
import { ApiError, getPublicListingDetail } from "@/lib/server-api";
import { parseCompareIds } from "@/lib/saved-views";
import { SiteHeader } from "../site-header";
import { SavedWorkspace, ShareLink } from "../saved-workspace";
import { VehicleComparison } from "./vehicle-comparison";

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const ids = parseCompareIds(params.ids);
  const cars = ids ? await Promise.all(ids.map(async (id) => {
    try { return await getPublicListingDetail(id); }
    catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
  })) : [];
  return <main className="shell public-shell"><SiteHeader active="compare" /><section className="page-heading"><div><span className="heading-context">Your research workspace</span><h1>{ids?.length ? "Compare cars" : "Saved & compare"}</h1><p>Keep a shortlist, compare the details and return to your research.</p></div><Link className="button-link secondary-button" href="/listings">Find cars</Link></section>
    {ids === null && <p role="alert">Choose up to four valid listings to compare.</p>}
    {cars.some((car) => !car) && <p>Some selected listings are no longer available here.</p>}
    {cars.length > 0 && <><ShareLink href={`/compare?ids=${ids?.join(",")}`} /><VehicleComparison cars={cars.filter((car) => car !== null)} /></>}
    <SavedWorkspace />
  </main>;
}
