// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import ListingPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/server-api", async () => ({
  ApiError: (await import("@/lib/api")).ApiError,
  getPublicListingDetail: async () => { throw new ApiError("Temporarily unavailable", 503); },
}));

it("keeps the originating saved workspace reachable during a recoverable detail failure", async () => {
  const returnTo = "/compare?ids=a,b&reference=b&differences=1#saved-workspace";
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(await ListingPage({
    params: Promise.resolve({ listingId: "00000000-0000-4000-8000-000000000001" }),
    searchParams: Promise.resolve({ returnTo }),
  }));
  expect(container.textContent).toContain("Listing is temporarily unavailable");
  const link = [...container.querySelectorAll("a")].find((item) => item.textContent === "Back to saved workspace");
  expect(link?.getAttribute("href")).toBe(returnTo);
  expect(container.querySelector("button")?.textContent).toBe("Try again");
});
