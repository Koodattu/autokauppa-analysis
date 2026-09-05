import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, getListingLookup } from "@/lib/api";
import { sourceListingId } from "@/lib/listing-lookup";
import { SiteHeader } from "../site-header";
export default async function Lookup({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const { listing } = await searchParams;
  const id = typeof listing === "string" ? sourceListingId(listing) : null;
  let found: string | null = null;
  let unavailable = false;
  if (id) {
    try { found = (await getListingLookup(id)).listingId; }
    catch (error) { if (!(error instanceof ApiError)) throw error; unavailable = error.status !== 404; }
  }
  if (found) redirect(`/listings/${found}`);
  return <main className="shell public-shell"><SiteHeader /><section className="panel"><h1>{unavailable ? "Listing lookup is temporarily unavailable" : id ? "This listing has not been collected" : "Check the listing address"}</h1><p>{id ? "You can still research similar cars in the dataset." : "Enter a Nettiauto listing URL or its numeric listing ID."}</p><Link href="/analyze">Research similar cars</Link> · <Link href="/">Try another listing</Link></section></main>;
}
