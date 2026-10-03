// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSearch } from "./saved-workspace";

const key = "nettiauto-saved-v1";
const href = "/listings?availability=current&priceMax=20000";
let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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

async function fillName(value: string) {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
