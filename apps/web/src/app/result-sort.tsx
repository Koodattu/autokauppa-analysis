"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ResultSort({ href, scope = "listings" }: { href: string; scope?: "listings" | "primary" | "comparison" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const params = new URL(href, "https://scope.invalid").searchParams;
  const listings = scope === "listings";
  const sortName = scope === "comparison" ? "compareSort" : "sort";
  const pageName = scope === "comparison" ? "comparePage" : "page";
  const route = listings ? "/listings" : "/analyze";
  const anchor = listings ? "listing-results" : scope === "comparison" ? "comparison-evidence" : "research-evidence";
  const orderLabel = listings ? "Listing order" : scope === "comparison" ? "Comparison evidence order" : "Primary evidence order";
  // Research supports only orders based on the selected observations. Other
  // listing orders in older links already fall back to most recently observed.
  const requestedSort = params.get(sortName) ?? (listings ? "firstSeenDesc" : "lastSeenDesc");
  const sort = !listings && ["firstSeenDesc", "priceReductionDesc", "sourceUpdatedDesc"].includes(requestedSort) ? "lastSeenDesc" : requestedSort;
  return <form className="listing-sort" action={`${route}#${anchor}`} method="get" aria-label={orderLabel} aria-busy={pending}
    onSubmit={(event) => {
      event.preventDefault();
      const query = new URLSearchParams();
      for (const [key, value] of new FormData(event.currentTarget)) query.set(key, String(value));
      startTransition(() => router.push(`${route}?${query}#${anchor}`));
    }}>
    {[...params].filter(([key]) => key !== sortName && key !== pageName).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <label>Sort by <select name={sortName} defaultValue={sort} aria-label={listings ? undefined : `Sort ${scope} evidence by`}>
      {listings && <option value="firstSeenDesc">First observed: newest</option>}
      {listings && <option value="priceReductionDesc">Largest recorded reduction</option>}
      <option value="lastSeenDesc">Recently observed</option>
      {listings && <option value="sourceUpdatedDesc">Recently updated</option>}
      <option value="priceAsc">Lowest price</option>
      <option value="priceDesc">Highest price</option>
      <option value="mileageAsc">Lowest mileage</option>
      <option value="mileageDesc">Highest mileage</option>
      <option value="yearDesc">Newest model year</option>
    </select></label>
    <button className="secondary-button" disabled={pending}>{pending ? "Sorting…" : listings ? "Sort listings" : "Sort evidence"}</button>
    <span className="sr-only" role="status">{pending ? (listings ? "Updating listing order" : `Updating ${scope} evidence order`) : ""}</span>
  </form>;
}
