import { describe, expect, test } from "vitest";

import type { ConnectionReconnectorContext } from "./connection-reconnector.interface.ts";
import { ExponentialBackoffReconnector } from "./exponential-backoff-reconnector.ts";

const context = (attempt: number): ConnectionReconnectorContext => ({
  relay: "wss://relay.example.com",
  phase: "recovery",
  attempt,
  reason: { kind: "connection-dropped" },
  signal: new AbortController().signal,
  health: { consecutiveFailures: attempt },
});

describe("ExponentialBackoffReconnector", () => {
  test("uses capped exponential delays and exhausts after the limit", () => {
    const reconnector = new ExponentialBackoffReconnector({
      initialDelay: 1_000,
      maxDelay: 2_500,
      maxRetries: 3,
      jitter: 0,
    });

    expect(reconnector.reconnect(context(1))).toMatchObject({
      action: "retry",
      delay: 1_000,
    });
    expect(reconnector.reconnect(context(2))).toMatchObject({
      action: "retry",
      delay: 2_000,
    });
    expect(reconnector.reconnect(context(3))).toMatchObject({
      action: "retry",
      delay: 2_500,
    });
    expect(reconnector.reconnect(context(4))).toMatchObject({ action: "exhaust" });
  });

  test("applies bounded jitter", () => {
    const low = new ExponentialBackoffReconnector({ random: () => 0 });
    const high = new ExponentialBackoffReconnector({ random: () => 1 });

    expect(low.reconnect(context(1)).suppressionReasons).toEqual([
      { category: "retry-backoff", source: "exponential-backoff", kind: "backoff" },
    ]);
    expect(low.reconnect(context(1))).toMatchObject({ action: "retry", delay: 800 });
    expect(high.reconnect(context(1))).toMatchObject({ action: "retry", delay: 1_200 });
  });
});

test("keeps the default retrying and supports zero delay after many failures", () => {
  expect(new ExponentialBackoffReconnector().reconnect(context(10_000))).toMatchObject({
    action: "retry",
  });
  expect(
    new ExponentialBackoffReconnector({ initialDelay: 0 }).reconnect(context(10_000)),
  ).toMatchObject({ action: "retry", delay: 0 });
});
