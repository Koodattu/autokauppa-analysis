"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ListingSort({ href }: { href: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const params = new URL(href, "https://scope.invalid").searchParams;
  return <form className="listing-sort" action="/listings#listing-results" method="get" aria-label="Listing order" aria-busy={pending}
    onSubmit={(event) => {
      event.preventDefault();
      const query = new URLSearchParams();
      for (const [key, value] of new FormData(event.currentTarget)) query.set(key, String(value));
      startTransition(() => router.push(`/listings?${query}#listing-results`));
    }}>
    {[...params].filter(([key]) => key !== "sort" && key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <label>Sort by <select name="sort" defaultValue={params.get("sort") ?? "firstSeenDesc"}>
      <option value="firstSeenDesc">First observed: newest</option>
      <option value="priceReductionDesc">Largest recorded reduction</option>
      <option value="lastSeenDesc">Recently observed</option>
      <option value="sourceUpdatedDesc">Recently updated</option>
      <option value="priceAsc">Lowest price</option>
      <option value="priceDesc">Highest price</option>
      <option value="mileageAsc">Lowest mileage</option>
      <option value="mileageDesc">Highest mileage</option>
      <option value="yearDesc">Newest model year</option>
    </select></label>
    <button className="secondary-button" disabled={pending}>{pending ? "Sorting…" : "Sort listings"}</button>
    <span className="sr-only" role="status">{pending ? "Updating listing order" : ""}</span>
  </form>;
}
