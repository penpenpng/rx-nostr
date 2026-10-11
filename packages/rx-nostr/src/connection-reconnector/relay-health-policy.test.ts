import { describe, expect, test } from "vitest";

import {
  evaluateRelayConnection,
  ExponentialRelaySuppressionStrategy,
} from "./relay-health-policy.ts";

describe("evaluateRelayConnection", () => {
  const policy = {
    minFailures: 3,
    minFailureDuration: 100,
    initialRetryDelay: 200,
    maxRetryDelay: 500,
  };

  test("requires both sustained failures and a failure count, and releases at the deadline", () => {
    expect(
      evaluateRelayConnection(
        { consecutiveFailures: 20, firstFailureAt: 90, lastFailureAt: 100 },
        100,
        policy,
      ),
    ).toEqual({ action: "allow" });
    expect(
      evaluateRelayConnection(
        { consecutiveFailures: 2, firstFailureAt: 0, lastFailureAt: 100 },
        100,
        policy,
      ),
    ).toEqual({ action: "allow" });
    const health = { consecutiveFailures: 3, firstFailureAt: 0, lastFailureAt: 100 };

    expect(evaluateRelayConnection(health, 100, policy)).toEqual({
      action: "suppress",
      suppressedUntil: 300,
    });
    expect(evaluateRelayConnection(health, 299, policy)).toMatchObject({
      action: "suppress",
      suppressedUntil: 300,
    });
    expect(evaluateRelayConnection(health, 300, policy)).toEqual({
      action: "probe",
      suppressedUntil: 300,
    });
    expect(evaluateRelayConnection({ ...health, liveConnections: 1 }, 100, policy)).toEqual({
      action: "allow",
    });
  });
  test("increases suppression after further failures, with a finite cap", () => {
    expect(
      evaluateRelayConnection(
        { consecutiveFailures: 4, firstFailureAt: 0, lastFailureAt: 200 },
        200,
        policy,
      ),
    ).toMatchObject({ suppressedUntil: 600 });
    expect(
      evaluateRelayConnection(
        { consecutiveFailures: 50, firstFailureAt: 0, lastFailureAt: 10_000 },
        10_000,
        policy,
      ),
    ).toMatchObject({ suppressedUntil: 10_500 });
  });
  test("does not infer an outage duration from legacy health without firstFailureAt", () => {
    expect(
      evaluateRelayConnection({ consecutiveFailures: 50, lastFailureAt: 10_000 }, 10_000, policy),
    ).toEqual({ action: "allow" });
    expect(() =>
      evaluateRelayConnection({ consecutiveFailures: 0 }, 0, { minFailureDuration: 0 }),
    ).toThrow(RangeError);
  });

  test("the default strategy preserves an elapsed schedule for a shared confirmation attempt", () => {
    const strategy = new ExponentialRelaySuppressionStrategy(policy);
    const context = {
      relay: "wss://relay.example.com" as const,
      health: { consecutiveFailures: 3, firstFailureAt: 0, lastFailureAt: 100 },
      now: 100,
    };
    const suppression = {
      suppressedUntil: 300,
      suppressionReason: {
        source: "relay-health-policy",
        kind: "relay-health",
        details: { consecutiveFailures: 3, failingSince: 0 },
      },
    };

    expect(strategy.getSuppression(context)).toEqual(suppression);
    expect(strategy.getSuppression({ ...context, now: 300 })).toEqual(suppression);
    expect(
      strategy.getSuppression({ ...context, health: { consecutiveFailures: 0 } }),
    ).toBeUndefined();
  });
});
