// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ResultSort } from "./result-sort";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

it("changes ordering without losing the selected cars and returns to the first evidence page", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ResultSort href="/listings?make=Toyota&availability=all&priceMax=25000&activity=priceReduced&page=3&sort=lastSeenDesc" />));
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

it.each(["primary", "comparison"] as const)("sorts %s research evidence without changing the other group's position", async (scope) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  push.mockClear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const original = { make: "Honda", availability: "current", from: "2026-09-01", to: "2026-09-30", page: "2", sort: "priceAsc",
    comparing: "1", compareMake: "Toyota", compareFrom: "2026-10-01", comparePage: "3", compareSort: "mileageAsc" };
  try {
    await act(async () => root.render(<ResultSort scope={scope} href={`/analyze?${new URLSearchParams(original)}`} />));
    const form = container.querySelector("form")!;
    const select = container.querySelector("select")!;
    select.value = "priceDesc";
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const result = new URL(push.mock.calls[0][0], "https://example.test");
    const expected: Record<string, string> = { ...original };
    delete expected[scope === "comparison" ? "comparePage" : "page"];
    expected[scope === "comparison" ? "compareSort" : "sort"] = "priceDesc";
    expect(Object.fromEntries(result.searchParams)).toEqual(expected);
    expect(result.pathname).toBe("/analyze");
    expect(result.hash).toBe(scope === "comparison" ? "#comparison-evidence" : "#research-evidence");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
