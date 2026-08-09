import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "./rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("blocks above the limit and resets after the window", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.check("client", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("client", 100)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("client", 200)).toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.check("client", 1_001)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps clients isolated", () => {
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.check("one", 0).allowed).toBe(true);
    expect(limiter.check("one", 1).allowed).toBe(false);
    expect(limiter.check("two", 1).allowed).toBe(true);
  });
});
