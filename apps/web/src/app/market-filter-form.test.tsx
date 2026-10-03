// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterMetadata } from "@nettiauto/schemas";
import { MarketFilterForm } from "./market-filter-form";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const filters: FilterMetadata = {
  makes: ["Honda", "Toyota"], models: [], yearRange: { min: 2000, max: 2026 },
  sellerTypes: [], fuelTypes: [], transmissions: [], bodyTypes: [], availability: ["all", "current", "sold"],
};
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
  push.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<MarketFilterForm action="/listings" variant="listings" filters={filters} params={{}} />); });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function selectMake(value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('select[name="make"]')!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("market model options", () => {
  it("applies listing filters while keeping the sort and returning to the first results page", async () => {
    await act(async () => root!.render(<MarketFilterForm key="listing-scope" action="/listings" variant="listings" filters={filters}
      params={{ make: "Toyota", availability: "all", sort: "priceAsc", page: "3" }} resultAnchor="listing-results" />));
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const url = new URL(push.mock.calls[0][0], "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ make: "Toyota", availability: "all", sort: "priceAsc" });
    expect(url.hash).toBe("#listing-results");
    expect(container.querySelector(".filter-reset")?.getAttribute("href")).toBe("/listings?sort=priceAsc#listing-results");
    expect(container.querySelector(".filter-reset")?.textContent).toBe("Reset 2 filters");
  });

  it("applies dates within the edited group and returns to that result while preserving the other group", async () => {
    await act(async () => { root!.render(<MarketFilterForm key="comparison" action="/analyze" variant="analytics" filters={filters}
      params={{ make: "Toyota", availability: "sold", from: "2026-09-01", to: "2026-09-30" }}
      comparisonBase="make=Honda&availability=current&page=2&comparing=1&compareMake=Toyota&comparePage=3" resultAnchor="comparison-research" />); });
    const from = container.querySelector<HTMLInputElement>('[name="from"]')!;
    const to = container.querySelector<HTMLInputElement>('[name="to"]')!;
    from.value = "2026-10-01"; to.value = "2026-10-02";
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    const url = new URL(push.mock.calls[0][0], "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ make: "Honda", availability: "current", page: "2", comparing: "1", compareMake: "Toyota", compareAvailability: "sold", compareFrom: "2026-10-01", compareTo: "2026-10-02" });
    expect(url.searchParams.has("comparePage")).toBe(false);
    expect(url.hash).toBe("#comparison-research");
    // Invalid dates retain the user's values and focus the correction rather than navigating.
    push.mockClear(); from.value = "2026-11-01";
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(push).not.toHaveBeenCalled();
    expect(from.value).toBe("2026-11-01");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  });

  it("resets only the primary research group and retains the comparison", async () => {
    await act(async () => { root!.render(<MarketFilterForm action="/analyze" variant="analytics" filters={filters}
      params={{ make: "Honda", from: "2026-09-01", comparing: "1", compareMake: "Toyota", compareFrom: "2026-10-01", comparePage: "2" }} />); });
    const reset = container.querySelector<HTMLAnchorElement>(".filter-reset")!;
    const url = new URL(reset.href);
    expect(Object.fromEntries(url.searchParams)).toEqual({ comparing: "1", compareMake: "Toyota", compareFrom: "2026-10-01", comparePage: "2" });
  });

  it("recovers from a stalled request and retries without losing the selected make", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    await selectMake("Toyota");
    expect(container.querySelector<HTMLSelectElement>('select[name="model"]')?.disabled).toBe(true);
    await act(async () => { deadline.abort(new DOMException("Timed out", "TimeoutError")); });

    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry");
    expect(retry, "a stalled request must offer recovery").toBeDefined();
    expect(container.querySelector<HTMLSelectElement>('select[name="make"]')?.value).toBe("Toyota");
    vi.mocked(AbortSignal.timeout).mockReturnValue(new AbortController().signal);
    fetchMock.mockResolvedValueOnce(Response.json({ ...filters, models: ["Corolla"] }));
    await act(async () => { retry!.click(); });
    const model = container.querySelector<HTMLSelectElement>('select[name="model"]')!;
    expect(model.disabled).toBe(false);
    expect([...model.options].map((option) => option.textContent)).toEqual(["All models", "Corolla"]);
    expect(container.textContent).not.toContain("couldn’t be loaded");
  });

  it("cancels abandoned requests and keeps only the latest make's models", async () => {
    const requests: Array<{ signal?: AbortSignal | null; resolve: (response: Response) => void }> = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve) => {
      requests.push({ signal: init?.signal, resolve });
    })));
    await selectMake("Honda");
    await selectMake("Toyota");
    expect(requests[0].signal?.aborted).toBe(true);
    await act(async () => { requests[1].resolve(Response.json({ ...filters, models: ["Corolla"] })); });
    await act(async () => { requests[0].resolve(Response.json({ ...filters, models: ["Civic"] })); });
    const model = container.querySelector<HTMLSelectElement>('select[name="model"]')!;
    expect([...model.options].map((option) => option.textContent)).toEqual(["All models", "Corolla"]);

    await selectMake("Honda");
    await act(async () => { root!.unmount(); root = undefined; });
    expect(requests[2].signal?.aborted).toBe(true);
  });
});
