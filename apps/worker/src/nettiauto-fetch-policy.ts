export const NETTIAUTO_SEARCH_MAX_ATTEMPTS = 5;
export const NETTIAUTO_DETAIL_MAX_ATTEMPTS = 3;
export const NETTIAUTO_DETAIL_PRIORITY_OFFSET = 100;

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const CIRCUIT_BREAKER_FAILURES = new Set([
  "blocked",
  "rate_limited",
  "redirected",
  "unexpected_response_body_shape",
]);

export class RetryableNettiautoFetchError extends Error {
  constructor(
    public readonly failureReason: string,
    message: string,
  ) {
    super(message);
    this.name = "RetryableNettiautoFetchError";
  }
}

export function isRetryableNettiautoHttpStatus(statusCode: number) {
  return RETRYABLE_HTTP_STATUSES.has(statusCode);
}

export function shouldPauseNettiautoSource(failureReason: string) {
  return CIRCUIT_BREAKER_FAILURES.has(failureReason);
}

export function classifyRequestError(input: {
  timeoutAborted: boolean;
  workerAborted: boolean;
}) {
  if (input.timeoutAborted) {
    return "request_timeout";
  }
  if (input.workerAborted) {
    return "worker_shutdown";
  }
  return "network_error";
}

export function createNettiautoRequestSignal(parentSignal: AbortSignal, timeoutMs: number) {
  if (timeoutMs === 0) {
    return { signal: parentSignal, timeoutSignal: null };
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: AbortSignal.any([parentSignal, timeoutSignal]),
    timeoutSignal,
  };
}
