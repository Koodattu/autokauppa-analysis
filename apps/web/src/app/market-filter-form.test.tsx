// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterMetadata } from "@nettiauto/schemas";
import { MarketFilterForm } from "./market-filter-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const filters: FilterMetadata = {
  makes: ["Honda", "Toyota"], models: [], yearRange: { min: 2000, max: 2026 },
  sellerTypes: [], fuelTypes: [], transmissions: [], bodyTypes: [], availability: ["all", "current", "sold"],
};
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(async () => {
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
