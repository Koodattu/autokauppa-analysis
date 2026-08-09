import { describe, expect, it } from "vitest";
import {
  classifyRequestError,
  isRetryableNettiautoHttpStatus,
  shouldPauseNettiautoSource,
  terminalSearchRunStatus,
} from "./nettiauto-fetch-policy";

describe("Nettiauto fetch retry policy", () => {
  it.each([408, 429, 500, 502, 503, 504])("retries transient HTTP %s", (status) => {
    expect(isRetryableNettiautoHttpStatus(status)).toBe(true);
  });

  it.each([301, 302, 400, 401, 403, 404, 409, 422, 501])(
    "does not retry terminal HTTP %s",
    (status) => {
      expect(isRetryableNettiautoHttpStatus(status)).toBe(false);
    },
  );

  it("uses failed for page one and partial after progress", () => {
    expect(terminalSearchRunStatus(1)).toBe("failed");
    expect(terminalSearchRunStatus(2)).toBe("partial");
  });

  it("opens the circuit breaker only for source block signals", () => {
    expect(shouldPauseNettiautoSource("blocked")).toBe(true);
    expect(shouldPauseNettiautoSource("rate_limited")).toBe(true);
    expect(shouldPauseNettiautoSource("unexpected_response_body_shape")).toBe(true);
    expect(shouldPauseNettiautoSource("network_error")).toBe(false);
    expect(shouldPauseNettiautoSource("http_500")).toBe(false);
  });

  it("distinguishes request timeouts, worker shutdowns, and network errors", () => {
    expect(classifyRequestError({ timeoutAborted: true, workerAborted: false })).toBe(
      "request_timeout",
    );
    expect(classifyRequestError({ timeoutAborted: false, workerAborted: true })).toBe(
      "worker_shutdown",
    );
    expect(classifyRequestError({ timeoutAborted: false, workerAborted: false })).toBe(
      "network_error",
    );
  });
});
