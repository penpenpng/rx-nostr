import { describe, expect, test } from "vitest";
import type { ConnectionRetryContext } from "./connection-retryer.interface.ts";
import { ExponentialBackoffRetryer } from "./exponential-backoff-retryer.ts";

const context = (attempt: number): ConnectionRetryContext => ({
  relay: "wss://relay.example.com",
  phase: "recovery",
  attempt,
  reason: { kind: "connection-dropped" },
  signal: new AbortController().signal,
  health: { consecutiveFailures: attempt },
});

describe("ExponentialBackoffRetryer", () => {
  test("uses capped exponential delays and exhausts after the limit", () => {
    const retryer = new ExponentialBackoffRetryer({
      initialDelay: 1_000,
      maxDelay: 2_500,
      maxRetries: 3,
      jitter: 0,
    });

    expect(retryer.retry(context(1))).toEqual({
      action: "retry",
      delay: 1_000,
    });
    expect(retryer.retry(context(2))).toEqual({
      action: "retry",
      delay: 2_000,
    });
    expect(retryer.retry(context(3))).toEqual({
      action: "retry",
      delay: 2_500,
    });
    expect(retryer.retry(context(4))).toEqual({ action: "exhaust" });
  });

  test("applies bounded jitter", () => {
    const low = new ExponentialBackoffRetryer({ random: () => 0 });
    const high = new ExponentialBackoffRetryer({ random: () => 1 });

    expect(low.retry(context(1))).toEqual({ action: "retry", delay: 800 });
    expect(high.retry(context(1))).toEqual({ action: "retry", delay: 1_200 });
  });
});
