// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComparisonTray, SaveCar, SaveSearch, SavedWorkspace } from "./saved-workspace";

const key = "nettiauto-saved-v2";
const href = "/listings?availability=current&priceMax=20000";
const location = vi.hoisted(() => ({ pathname: "/compare", search: "" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.pathname, useSearchParams: () => new URLSearchParams(location.search) }));
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  location.pathname = "/compare";
  location.search = "";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("saved research views", () => {
  it("does not silently replace the oldest view when all twelve slots are occupied", async () => {
    const searches = Array.from({ length: 12 }, (_, index) => ({ href: `/analyze?make=Make${index}`, title: `Research ${index}` }));
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [], searches }));
    root = createRoot(container);
    await act(async () => { root!.render(<SaveSearch href={href} title="New search" />); });
    await act(async () => { container.querySelector("form")!.requestSubmit(); });
    expect(JSON.parse(localStorage.getItem(key)!).searches).toEqual(searches);
    expect(container.textContent).toContain("Saved views full (12)");
    await act(async () => { root!.render(<SaveSearch href={searches[0].href} title="New search" />); });
    await fillName("Renamed research");
    await act(async () => { container.querySelector("form")!.requestSubmit(); });
    expect(JSON.parse(localStorage.getItem(key)!).searches).toHaveLength(12);
    expect(JSON.parse(localStorage.getItem(key)!).searches.find((item: { href: string }) => item.href === searches[0].href).title).toBe("Renamed research");
  });

  it("restores the saved name after hydration and keeps it when updating the view", async () => {
    localStorage.setItem(key, JSON.stringify({ cars: [], searches: [{ href, title: "Family hybrids under €20k" }] }));
    container.innerHTML = renderToString(<SaveSearch href={href} title="Car search" />);
    await act(async () => { root = hydrateRoot(container, <SaveSearch href={href} title="Car search" />); });

    expect(container.querySelector("input")?.value).toBe("Family hybrids under €20k");
    await act(async () => { container.querySelector("form")!.requestSubmit(); });
    expect(JSON.parse(localStorage.getItem(key)!).searches).toEqual([{ href, title: "Family hybrids under €20k" }]);
    expect(container.textContent).toContain("Saved in this browser.");
  });

  it("preserves an edited name and the existing saved view when storage fails, then allows retry", async () => {
    localStorage.setItem(key, JSON.stringify({ cars: [], searches: [{ href, title: "Original view" }] }));
    root = createRoot(container);
    await act(async () => { root!.render(<SaveSearch href={href} title="Car search" />); });
    await fillName("Updated view");
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });

    await act(async () => { container.querySelector("form")!.requestSubmit(); });
    expect(container.querySelector("input")?.value).toBe("Updated view");
    expect(container.textContent).toContain("Your browser could not save this.");
    expect(container.textContent).not.toContain("Saved in this browser.");
    expect(JSON.parse(localStorage.getItem(key)!).searches[0].title).toBe("Original view");

    write.mockRestore();
    await act(async () => { container.querySelector("form")!.requestSubmit(); });
    expect(JSON.parse(localStorage.getItem(key)!).searches[0].title).toBe("Updated view");
    expect(container.textContent).toContain("Saved in this browser.");
    expect(container.textContent).not.toContain("Your browser could not save this.");
  });

  it("uses the destination view's name when navigation changes the filters", async () => {
    const secondHref = "/analyze?make=Toyota&availability=current";
    localStorage.setItem(key, JSON.stringify({ cars: [], searches: [{ href: secondHref, title: "Toyota prices" }] }));
    root = createRoot(container);
    await act(async () => { root!.render(<SaveSearch href={href} title="Car search" />); });
    await fillName("Unsubmitted edit");

    await act(async () => { root!.render(<SaveSearch href={secondHref} title="Price research" />); });
    expect(container.querySelector("input")?.value).toBe("Toyota prices");
    expect(container.textContent).toContain("Update saved view");
  });
});

describe("saved cars and comparison", () => {
  it.each(["/", "/compare"])("returns from saved and selected cars to the workspace on %s", async (pathname) => {
    const car = { id: "00000000-0000-4000-8000-000000000001", title: "Saved candidate" };
    location.pathname = pathname;
    localStorage.setItem(key, JSON.stringify({ cars: [car], shortlist: [car], searches: [] }));
    root = createRoot(container);
    await act(async () => root!.render(<SavedWorkspace />));
    const returnLinks = () => [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/listings/"]')].map((link) => new URL(link.href).searchParams.get("returnTo"));
    expect(returnLinks()).toEqual([`${pathname}#saved-workspace`, `${pathname}#saved-workspace`]);
    expect(container.querySelector("#saved-workspace")?.getAttribute("tabindex")).toBe("-1");
    if (pathname === "/compare") {
      location.search = `ids=${car.id}&reference=${car.id}&differences=1`;
      await act(async () => root!.render(<SavedWorkspace />));
      expect(returnLinks()).toEqual(Array(2).fill(`/compare?${location.search}#saved-workspace`));
    }
  });

  it("retains observed evidence while refreshing and after failure, then replaces it on a successful retry", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const listing = { listingId: id, make: "Toyota", model: "Corolla", yearModel: 2020, availability: "active", askingPriceEur: 17000,
      observedSoldPriceEur: null, mileageKm: 80000, lastSeenAt: "2026-10-02T10:00:00Z" };
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [{ id, title: "Toyota Corolla" }], searches: [] }));
    let rejectRefresh!: (error: Error) => void;
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ items: [listing] }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...listing, askingPriceEur: 16500 }] }));
    root = createRoot(container);
    await act(async () => root!.render(<SavedWorkspace />));
    const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === text)!;
    expect(container.textContent).toContain("17\u00a0000 €");
    await act(async () => button("Refresh evidence").click());
    expect(container.textContent).toContain("17\u00a0000 €");
    expect(container.textContent).toContain("Refreshing latest evidence");
    await act(async () => rejectRefresh(new TypeError("offline")));
    expect(container.textContent).toContain("17\u00a0000 €");
    expect(container.textContent).toContain("2 Oct 2026");
    expect(container.textContent).toContain("Showing previously loaded observations");
    await act(async () => button("Retry").click());
    expect(container.textContent).toContain("16\u00a0500 €");
    expect(container.textContent).not.toContain("17\u00a0000 €");
    expect(container.textContent).not.toContain("previously loaded");
    await act(async () => button("Refresh evidence").click());
    expect(container.textContent).toContain("No longer available in this dataset");
    expect(container.textContent).not.toContain("16\u00a0500 €");
  });

  it("can remove an unsaved comparison candidate individually without clearing the shortlist", async () => {
    const candidate = { id: "00000000-0000-4000-8000-000000000001", title: "Comparison only" };
    const saved = { id: "00000000-0000-4000-8000-000000000002", title: "Keep saved" };
    localStorage.setItem(key, JSON.stringify({ cars: [candidate], shortlist: [saved], searches: [] }));
    root = createRoot(container);
    await act(async () => { root!.render(<SavedWorkspace />); });
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Comparison only from comparison"]');
    expect(remove).not.toBeNull();
    await act(async () => remove!.click());
    expect(JSON.parse(localStorage.getItem(key)!).cars).toEqual([]);
    expect(JSON.parse(localStorage.getItem(key)!).shortlist).toEqual([saved]);
  });

  it("updates from another tab and ignores a late response for the previous saved list", async () => {
    const first = { id: "00000000-0000-4000-8000-000000000001", title: "First car" };
    const second = { id: "00000000-0000-4000-8000-000000000002", title: "Second car" };
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [first], searches: [] }));
    let resolveFirst!: (response: Response) => void;
    let oldSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce((_url, options) => {
      oldSignal = options?.signal ?? undefined;
      return new Promise((resolve) => { resolveFirst = resolve; });
    });
    root = createRoot(container);
    await act(async () => { root!.render(<SavedWorkspace />); });
    expect(container.textContent).toContain("Loading latest evidence");
    await act(async () => {
      localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [second], searches: [] }));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { resolveFirst(new Response(JSON.stringify({ items: [] }))); });
    expect(container.textContent).toContain("Second car");
    expect(container.textContent).not.toContain("First car");
    expect(container.textContent).not.toContain("Loading latest evidence");
  });

  it("preserves twenty saved cars at the limit and leaves comparison independent", async () => {
    const shortlist = Array.from({ length: 20 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, title: `Saved ${index}` }));
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist, searches: [] }));
    root = createRoot(container);
    await act(async () => { root!.render(<SaveCar id="00000000-0000-4000-8000-000000000021" title="Extra candidate" />); });
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Save Extra candidate"]')!.disabled).toBe(true);
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Compare Extra candidate"]')!.click(); });
    const stored = JSON.parse(localStorage.getItem(key)!);
    expect(stored.shortlist).toEqual(shortlist);
    expect(stored.cars).toEqual([{ id: "00000000-0000-4000-8000-000000000021", title: "Extra candidate" }]);
  });

  it("keeps the previous shortlist and offers the same action when a browser write fails", async () => {
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [], searches: [] }));
    root = createRoot(container);
    await act(async () => { root!.render(<SaveCar id="00000000-0000-4000-8000-000000000001" title="Candidate" />); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new DOMException("Full", "QuotaExceededError"); });
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Save Candidate"]')!;
    await act(async () => button.click());
    expect(JSON.parse(localStorage.getItem(key)!).shortlist).toEqual([]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).toContain("Your browser could not save this");
    await act(async () => button.click());
    expect(JSON.parse(localStorage.getItem(key)!).shortlist).toHaveLength(1);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps saved links through a failed summary request and retries to show current evidence and missing listings", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const missing = "00000000-0000-4000-8000-000000000002";
    localStorage.setItem(key, JSON.stringify({ cars: [], shortlist: [{ id, title: "Toyota Corolla" }, { id: missing, title: "Missing car" }], searches: [] }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ listingId: id, make: "Toyota", model: "Corolla", yearModel: 2020, availability: "sold", askingPriceEur: null, observedSoldPriceEur: 17000, mileageKm: 80000, lastSeenAt: "2026-10-02T10:00:00Z" }] })));
    root = createRoot(container);
    await act(async () => { root!.render(<SavedWorkspace />); });
    expect(container.textContent).toContain("Latest evidence could not be loaded");
    expect(container.querySelector(`a[href^="/listings/${id}?"]`)).not.toBeNull();
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry")!;
    await act(async () => retry.click());
    expect(container.textContent).toContain("17\u00a0000 €");
    expect(container.textContent).toContain("Shown on sold listing");
    expect(container.textContent).toContain("2 Oct 2026");
    expect(container.textContent).toContain("No longer available in this dataset");
    expect(container.textContent).not.toContain("Latest evidence could not be loaded");
  });

  it("preserves legacy cars and saves a fifth car while comparison is full, then clears only the comparison", async () => {
    const cars = Array.from({ length: 4 }, (_, index) => ({
      id: `00000000-0000-4000-8000-00000000000${index + 1}`, title: `Candidate ${index + 1}`,
    }));
    localStorage.setItem("nettiauto-saved-v1", JSON.stringify({ cars, searches: [{ href, title: "Family cars" }] }));
    root = createRoot(container);
    await act(async () => { root!.render(<><SaveCar id="00000000-0000-4000-8000-000000000005" title="Fifth candidate" /><ComparisonTray /><SavedWorkspace /></>); });
    const saveButton = container.querySelector<HTMLButtonElement>('button[aria-label="Save Fifth candidate"]');
    expect(saveButton).not.toBeNull();
    expect(saveButton!.disabled).toBe(false);
    await act(async () => saveButton!.click());
    expect(JSON.parse(localStorage.getItem(key)!).shortlist).toHaveLength(5);
    const clear = [...container.querySelectorAll("button")].find((button) => button.textContent === "Clear selection")!;
    await act(async () => clear.click());
    const stored = JSON.parse(localStorage.getItem(key)!);
    expect(stored.cars).toEqual([]);
    expect(stored.shortlist.map((car: { title: string }) => car.title)).toEqual(["Candidate 1", "Candidate 2", "Candidate 3", "Candidate 4", "Fifth candidate"]);
    expect(stored.searches).toEqual([{ href, title: "Family cars" }]);
    expect(container.textContent).toContain("Fifth candidate");
  });
});

async function fillName(value: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
