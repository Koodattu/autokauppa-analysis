// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ListingSort } from "./listing-sort";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

it("changes ordering without losing the selected cars and returns to the first evidence page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ListingSort href="/listings?make=Toyota&availability=all&priceMax=25000&activity=priceReduced&page=3&sort=lastSeenDesc" />));
    const form = container.querySelector("form")!;
    const select = container.querySelector<HTMLSelectElement>('[name="sort"]')!;
    expect(select.value).toBe("lastSeenDesc");
    select.value = "priceAsc";
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const result = new URL(push.mock.calls[0][0], "https://example.test");
    expect(result.pathname).toBe("/listings");
    expect(Object.fromEntries(result.searchParams)).toEqual({ make: "Toyota", availability: "all", priceMax: "25000", activity: "priceReduced", sort: "priceAsc" });
    expect(result.hash).toBe("#listing-results");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
