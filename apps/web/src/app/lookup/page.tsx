import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, getListingLookup } from "@/lib/server-api";
import { sourceListingId } from "@/lib/listing-lookup";
import { SiteHeader } from "../site-header";
import { ListingLookupForm } from "../listing-lookup-form";
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
  const value = typeof listing === "string" ? listing : "";
  return <main className="shell public-shell"><SiteHeader /><section className="panel page-error">
    <h1>{unavailable ? "Listing lookup is temporarily unavailable" : id ? "This listing has not been collected" : value ? "Check the listing address" : "Find a listing"}</h1>
    <p id="lookup-guidance">{unavailable ? "Your address is kept below. Try again shortly." : id ? "Try another listing, or research similar cars in the dataset." : "Enter a Nettiauto listing URL or its numeric listing ID."}</p>
    <ListingLookupForm value={value} invalid={Boolean(value) && !id} />
    <Link href="/analyze">Research similar cars</Link>
  </section></main>;
}
