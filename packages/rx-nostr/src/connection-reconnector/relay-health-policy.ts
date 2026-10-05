import type { ConnectionSuppressionReason } from "../connection-state.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";

/** Health used to distinguish sustained failures from a short interruption. */
export interface RelayHealth {
  consecutiveFailures: number;
  firstFailureAt?: number;
  lastFailureAt?: number;
  lastConnectedAt?: number;
  liveConnections?: number;
}

export interface RelayHealthPolicy {
  /** Defaults to 5. */
  minFailures?: number;
  /** Minimum observed failure duration in milliseconds. Defaults to 5 minutes. */
  minFailureDuration?: number;
  /** Initial suppression duration in milliseconds. Defaults to 5 minutes. */
  initialRetryDelay?: number;
  /** Maximum suppression duration in milliseconds. Defaults to 1 hour. */
  maxRetryDelay?: number;
}

export interface RelaySuppression {
  /** Absolute Unix time in milliseconds, including when the deadline has already passed. */
  readonly suppressedUntil: number;
  /** Optional implementation-owned explanation, passed through to connection state. */
  readonly suppressionReason?: Pick<ConnectionSuppressionReason, "source" | "kind" | "details">;
}

export interface RelaySuppressionContext {
  readonly relay: RelayUrl;
  readonly health: Readonly<RelayHealth>;
  readonly now: number;
}

/** Synchronous policy; the transport owns waiting, cancellation, and shared probes. */
export interface RelaySuppressionStrategy {
  /**
   * Returns a stable suppression schedule, or undefined for normal connection behavior.
   * An elapsed deadline permits a shared confirmation attempt. Do not extend deadlines
   * on each evaluation of unchanged health.
   */
  getSuppression(context: RelaySuppressionContext): RelaySuppression | undefined;
}

/** Existing numeric options remain a shorthand for the default strategy. */
export type RelayHealthPolicyInput = RelayHealthPolicy | RelaySuppressionStrategy | false;

export class ExponentialRelaySuppressionStrategy implements RelaySuppressionStrategy {
  readonly #policy: Readonly<RelayHealthPolicy>;

  constructor(policy: RelayHealthPolicy = {}) {
    this.#policy = Object.freeze({ ...policy });

    evaluateRelayConnection({ consecutiveFailures: 0 }, 0, this.#policy);
  }

  getSuppression({ health, now }: RelaySuppressionContext): RelaySuppression | undefined {
    const decision = evaluateRelayConnection(health, now, this.#policy);

    if (decision.action === "allow") {
      return;
    }

    return {
      suppressedUntil: decision.suppressedUntil,
      suppressionReason: {
        source: "relay-health-policy",
        kind: "relay-health",
        details: {
          consecutiveFailures: health.consecutiveFailures,
          failingSince: health.firstFailureAt!,
        },
      },
    };
  }
}

/** @internal Preserve strategy instances and their method receiver when copying config. */
export function copyRelayHealthPolicy(input: RelayHealthPolicyInput): RelayHealthPolicyInput {
  if (input === false) {
    return false;
  }
  if ("getSuppression" in input) {
    if (typeof input.getSuppression !== "function") {
      throw new TypeError("getSuppression must be a function.");
    }

    return input;
  }

  void new ExponentialRelaySuppressionStrategy(input);

  return Object.freeze({ ...input });
}

/** @internal Resolve numeric shorthand once, without evaluating a custom strategy. */
export function resolveRelaySuppressionStrategy(
  input: RelayHealthPolicyInput = {},
): RelaySuppressionStrategy | undefined {
  const copied = copyRelayHealthPolicy(input);

  if (copied === false) {
    return;
  }

  return "getSuppression" in copied ? copied : new ExponentialRelaySuppressionStrategy(copied);
}

export type RelayConnectionDecision =
  | { action: "allow" }
  | { action: "suppress" | "probe"; suppressedUntil: number };

/** Pure: an unchanged health snapshot never extends its suppression deadline. */
export function evaluateRelayConnection(
  health: RelayHealth,
  now: number,
  policy: RelayHealthPolicy = {},
): RelayConnectionDecision {
  const minFailures = policy.minFailures ?? 5;
  const duration = policy.minFailureDuration ?? 300_000;
  const initialDelay = policy.initialRetryDelay ?? 300_000;
  const maxDelay = policy.maxRetryDelay ?? 3_600_000;

  for (const [name, value] of Object.entries({ minFailures, duration, initialDelay, maxDelay })) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be positive and finite.`);
    }
  }

  if (!Number.isInteger(minFailures)) {
    throw new RangeError("minFailures must be an integer.");
  }
  if (
    (health.liveConnections ?? 0) > 0 ||
    health.consecutiveFailures < minFailures ||
    health.firstFailureAt === undefined ||
    health.lastFailureAt === undefined ||
    health.lastFailureAt - health.firstFailureAt < duration
  ) {
    return { action: "allow" };
  }

  const exponent = Math.min(
    52,
    Math.max(0, Math.floor((health.lastFailureAt - health.firstFailureAt) / duration) - 1),
  );
  const suppressedUntil = health.lastFailureAt + Math.min(initialDelay * 2 ** exponent, maxDelay);

  return { action: suppressedUntil > now ? "suppress" : "probe", suppressedUntil };
}
