"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { compareHref, EMPTY_SAVED, parseSavedState, type SavedState } from "@/lib/saved-views";

const KEY = "nettiauto-saved-v1";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("saved-cars", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("saved-cars", callback); };
}
function snapshot() {
  try { return localStorage.getItem(KEY) ?? EMPTY_SAVED; } catch { return EMPTY_SAVED; }
}
function useSaved() {
  const value = useSyncExternalStore(subscribe, snapshot, () => EMPTY_SAVED);
  const [error, setError] = useState("");
  function save(next: SavedState) {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("saved-cars"));
      setError("");
    } catch { setError("Your browser could not save this. You can still share the page link."); }
  }
  return { saved: parseSavedState(value), save, error };
}

export function SaveCar({ id, title }: { id: string; title: string }) {
  const { saved, save, error } = useSaved();
  const selected = saved.cars.some((car) => car.id === id);
  const full = saved.cars.length >= 4 && !selected;
  return <span className="save-car"><button type="button" className="secondary-button" aria-pressed={selected} disabled={full}
    onClick={() => save({ ...saved, cars: selected ? saved.cars.filter((car) => car.id !== id) : [...saved.cars, { id, title }] })}>
    {selected ? "Remove from comparison" : full ? "Comparison full (4)" : "Compare"}
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

export function SaveSearch({ href, title }: { href: string; title: string }) {
  const { saved, save, error } = useSaved();
  const [name, setName] = useState(title.slice(0, 120));
  const exists = saved.searches.some((search) => search.href === href);
  return <form className="save-search" onSubmit={(event) => { event.preventDefault(); save({ ...saved, searches: [...saved.searches.filter((search) => search.href !== href), { title: name.trim() || title.slice(0, 120), href }].slice(-12) }); }}>
    <label><span>Name this view</span><input aria-label="Saved view name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
    <button className="secondary-button">{exists ? "Update saved view" : "Save view"}</button>
    <ShareLink href={href} />{error && <span role="status">{error}</span>}
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
  return <section className="panel saved-workspace"><h2>Your saved cars and research</h2><p>Saved in this browser. Share a comparison or research link to open it elsewhere.</p>
    {saved.cars.length ? <ul>{saved.cars.map((car) => <li key={car.id}><Link href={`/listings/${car.id}`}>{car.title}</Link> <SaveCar id={car.id} title={car.title} /></li>)}</ul> : <p>No cars selected yet. Use Compare on any listing.</p>}
    {saved.cars.length > 0 && <Link className="button-link" href={compareHref(saved.cars.map((car) => car.id))}>Open comparison</Link>}
    <h3>Saved views</h3>{saved.searches.length ? <ul>{saved.searches.map((search) => <li key={search.href}><Link href={search.href}>{search.title}</Link> <button className="secondary-button" onClick={() => save({ ...saved, searches: saved.searches.filter((item) => item.href !== search.href) })}>Remove</button></li>)}</ul> : <p>Save an analysis or search to return to its filters and observation dates.</p>}
    {error && <p role="status">{error}</p>}
  </section>;
}
