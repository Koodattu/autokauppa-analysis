"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { compareHref, EMPTY_SAVED, parseSavedState, type SavedState } from "@/lib/saved-views";
import { listingSummariesResponseSchema, MAX_SAVED_CARS, type ListingSummary } from "@nettiauto/schemas";
import { formatDate, formatKm, formatListingPrice, labelAvailability } from "@/lib/format";

const KEY = "nettiauto-saved-v2";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("saved-cars", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("saved-cars", callback); };
}
function snapshot() {
  try { return localStorage.getItem(KEY) ?? localStorage.getItem("nettiauto-saved-v1") ?? EMPTY_SAVED; } catch { return EMPTY_SAVED; }
}
function useSaved() {
  const value = useSyncExternalStore(subscribe, snapshot, () => EMPTY_SAVED);
  const [error, setError] = useState("");
  function save(next: SavedState) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("saved-cars"));
      setError("");
      return true;
    } catch {
      setError("Your browser could not save this. You can still share the page link.");
      return false;
    }
  }
  return { saved: parseSavedState(value), save, error };
}

export function SaveCar({ id, title }: { id: string; title: string }) {
  const { saved, save, error } = useSaved();
  const selected = saved.cars.some((car) => car.id === id);
  const bookmarked = saved.shortlist.some((car) => car.id === id);
  const full = saved.cars.length >= 4 && !selected;
  const shortlistFull = saved.shortlist.length >= MAX_SAVED_CARS && !bookmarked;
  return <span className="save-car"><button type="button" className="secondary-button" aria-label={bookmarked ? `Remove ${title} from saved cars` : `Save ${title}`} aria-pressed={bookmarked} disabled={shortlistFull}
    onClick={() => save({ ...saved, shortlist: bookmarked ? saved.shortlist.filter((car) => car.id !== id) : [...saved.shortlist, { id, title: title.slice(0, 200) }] })}>
    {bookmarked ? "Saved · remove" : shortlistFull ? "Saved list full (20)" : "Save car"}
  </button><button type="button" className="secondary-button" aria-label={`Compare ${title}`} aria-pressed={selected} disabled={full}
    onClick={() => save({ ...saved, cars: selected ? saved.cars.filter((car) => car.id !== id) : [...saved.cars, { id, title: title.slice(0, 200) }] })}>
    {selected ? "Selected · remove" : full ? "Comparison full (4)" : "Compare"}
  </button>{error && <span role="status">{error}</span>}</span>;
}

export function ComparisonTray() {
  const { saved, save, error } = useSaved();
  if (!saved.cars.length) return null;
  return <aside className="comparison-tray" aria-label="Selected cars">
    <span>{saved.cars.length} / 4 cars selected</span>
    <Link className="button-link" href={compareHref(saved.cars.map((car) => car.id))}>Compare selected cars</Link>
    <button className="secondary-button" onClick={() => save({ ...saved, cars: [] })}>Clear selection</button>
    {error && <span role="status">{error}</span>}
  </aside>;
}

export function ContinueComparison({ cars }: { cars: SavedState["cars"] }) {
  const { saved, save, error } = useSaved();
  if (cars.length >= 4) return <p className="muted">Four cars compared. Remove a car from this view before choosing another.</p>;
  const replacesSelection = saved.cars.some((car) => !cars.some((shown) => shown.id === car.id));
  return <div className="comparison-continue">
    <Link className="button-link secondary-button" href="/listings#listing-results" onClick={(event) => {
      if (!save({ ...saved, cars })) event.preventDefault();
    }}>Choose more cars</Link>
    <span className="muted">Keep {cars.length === 1 ? "this car" : `these ${cars.length} cars`} selected while browsing.{replacesSelection ? " Replaces your current comparison selection." : ""}</span>
    {error && <span role="status">{error}</span>}
  </div>;
}

export function SaveSearch({ href, title }: { href: string; title: string }) {
  const { saved, save, error } = useSaved();
  const savedView = saved.searches.find((search) => search.href === href);
  const full = saved.searches.length >= 12 && !savedView;
  const [draft, setDraft] = useState<{ href: string; name: string } | null>(null);
  const [savedHref, setSavedHref] = useState<string | null>(null);
  const name = draft?.href === href ? draft.name : savedView?.title ?? title.slice(0, 120);

  return <form className="save-search" onSubmit={(event) => {
    event.preventDefault();
    if (full) return;
    setSavedHref(null);
    const nextTitle = name.trim() || savedView?.title || title.slice(0, 120);
    if (save({ ...saved, searches: [...saved.searches.filter((search) => search.href !== href), { title: nextTitle, href }] })) {
      setSavedHref(href);
    }
  }}>
    <label><span>Name this view</span><input aria-label="Saved view name" value={name} maxLength={120} onChange={(event) => {
      setDraft({ href, name: event.target.value });
      setSavedHref(null);
    }} /></label>
    <button className="secondary-button" disabled={full}>{savedView ? "Update saved view" : full ? "Saved views full (12)" : "Save view"}</button>
    {full && <Link href="/compare">Manage saved views</Link>}
    <ShareLink href={href} /><span role="status">{error || (savedHref === href ? "Saved in this browser." : "")}</span>
  </form>;
}

export function ShareLink({ href }: { href: string }) {
  const [message, setMessage] = useState("");
  return <span><button type="button" className="secondary-button" onClick={async () => {
    try { await navigator.clipboard.writeText(new URL(href, window.location.origin).href); setMessage("Link copied."); }
    catch { setMessage("Copy the address from your browser to share this view."); }
  }}>Copy link</button><span className="muted" role="status">{message}</span></span>;
}

export function SavedWorkspace() {
  const { saved, save, error } = useSaved();
  const pathname = usePathname();
  const params = useSearchParams();
  const returnTo = `${pathname}${params.size ? `?${params}` : ""}#saved-workspace`;
  return <section className="panel saved-workspace" id="saved-workspace" tabIndex={-1}><h2>Your saved cars and research</h2>
    <p className="muted">Keep up to 20 cars and 12 views in this browser. Compare up to four cars at a time. Clearing a comparison keeps your saved cars.</p>
    {saved.cars.length > 0 && <div className="saved-selection">
      <div><h3>Comparison selection · {saved.cars.length} / 4</h3>
        <ul className="saved-comparison-list">{saved.cars.map((car) => <li key={car.id}>
          <Link href={`/listings/${car.id}?returnTo=${encodeURIComponent(returnTo)}`}>{car.title}</Link>
          <button className="secondary-button" aria-label={`Remove ${car.title} from comparison`} onClick={() => save({ ...saved, cars: saved.cars.filter((item) => item.id !== car.id) })}>Remove</button>
        </li>)}</ul>
      </div>
      <Link className="button-link" href={compareHref(saved.cars.map((car) => car.id))}>Open comparison</Link>
    </div>}
    <SavedCars cars={saved.shortlist} returnTo={returnTo} />
    <div className="saved-views"><h3>Saved views · {saved.searches.length} / 12</h3>
      {saved.searches.length ? <ul>{saved.searches.map((search) => <li key={search.href}><Link href={search.href}>{search.title}</Link> <button className="secondary-button" aria-label={`Remove saved view ${search.title}`} onClick={() => save({ ...saved, searches: saved.searches.filter((item) => item.href !== search.href) })}>Remove</button></li>)}</ul> : <p>Save an <Link href="/analyze">analysis</Link> or <Link href="/listings">search</Link> to return to its filters and observation dates.</p>}
    </div>
    <p className="muted">Saved cars stay on this device. Copy a comparison or research link to share its view.</p>
    {error && <p role="status">{error}</p>}
  </section>;
}

function SavedCars({ cars, returnTo }: { cars: SavedState["shortlist"]; returnTo: string }) {
  const ids = cars.map((car) => car.id).join(",");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ ids: string; attempt: number; items: ListingSummary[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!ids) return;
    const request = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api"}/listings/summaries?${new URLSearchParams({ ids })}`, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]), cache: "no-store",
        });
        if (!response.ok) throw new Error("Summary request failed");
        const data = listingSummariesResponseSchema.parse(await response.json());
        if (!request.signal.aborted) setResult({ ids, attempt, items: data.items, error: false });
      } catch {
        if (!request.signal.aborted) setResult((previous) => ({ ids, attempt, items: previous?.ids === ids ? previous.items : [], error: true }));
      }
    }
    void load();
    return () => request.abort();
  }, [ids, attempt]);
  const current = result?.ids === ids ? result : null;
  const pending = !current || current.attempt !== attempt;
  function refresh() { setAttempt((value) => value + 1); }

  return <div className="saved-cars">
    <div className="saved-section-heading"><h3>Saved cars · {cars.length} / {MAX_SAVED_CARS}</h3>
      {cars.length > 0 && current && !current.error && <button className="secondary-button" disabled={pending} onClick={refresh}>Refresh evidence</button>}
    </div>
    {!cars.length ? <p>No saved cars yet. <Link href="/listings">Find cars</Link> and choose Save car to keep candidates here.</p> : <>
      <p className="muted">Stored prices and availability, with the date each car was observed. Sold listing prices are not confirmed transactions.</p>
      <div role="status">{pending ? <p>{current?.items.length ? "Refreshing latest evidence… Previously loaded observations remain visible." : "Loading latest evidence…"}</p>
        : current.error ? <p>{current.items.length ? "Refresh failed. Showing previously loaded observations." : "Latest evidence could not be loaded. Your saved cars are still here."} <button className="secondary-button" onClick={refresh}>Retry</button></p> : null}</div>
      <ul className="saved-car-list">{cars.map((car) => {
        const listing = current?.items.find((item) => item.listingId === car.id);
        const price = listing?.availability === "sold" ? listing.observedSoldPriceEur : listing?.askingPriceEur;
        return <li key={car.id}>
          <div className="saved-car-info"><Link className="saved-car-title" href={`/listings/${car.id}?returnTo=${encodeURIComponent(returnTo)}`}>{car.title}</Link>
            {listing ? <><div className="saved-car-facts"><strong>{formatListingPrice(price ?? null)}</strong><span>{labelAvailability(listing.availability)}</span><span>{formatKm(listing.mileageKm)}</span></div>
              <p className="muted">{listing.availability === "sold" ? "Shown on sold listing" : "Last asking price"} · Observed {formatDate(listing.lastSeenAt)}</p></>
              : current && !current.error ? <p className="muted">No longer available in this dataset. You can remove it from your saved cars.</p> : null}
          </div>
          <SaveCar id={car.id} title={car.title} />
        </li>;
      })}</ul>
    </>}
  </div>;
}
