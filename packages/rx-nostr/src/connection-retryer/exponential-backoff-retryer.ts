import type { ConnectionRetryContext, ConnectionRetryer } from "./connection-retryer.interface.ts";

export interface ExponentialBackoffRetryerOptions {
  /** Maximum number of retries after the failed connection attempt. */
  readonly maxRetries?: number;
  readonly initialDelay?: number;
  readonly maxDelay?: number;
  /** Random variation as a ratio from 0 through 1. */
  readonly jitter?: number;
  /** @internal Deterministic random source for tests. */
  readonly random?: () => number;
}

/** The default capped exponential reconnect policy used by rx-nostr. */
export class ExponentialBackoffRetryer implements ConnectionRetryer {
  readonly #maxRetries: number;
  readonly #initialDelay: number;
  readonly #maxDelay: number;
  readonly #jitter: number;
  readonly #random: () => number;

  constructor(options: ExponentialBackoffRetryerOptions = {}) {
    this.#maxRetries = options.maxRetries ?? 5;
    this.#initialDelay = options.initialDelay ?? 1_000;
    this.#maxDelay = options.maxDelay ?? 30_000;
    this.#jitter = options.jitter ?? 0.2;
    this.#random = options.random ?? Math.random;

    assertNonNegativeInteger(this.#maxRetries, "maxRetries");
    assertNonNegativeFinite(this.#initialDelay, "initialDelay");
    assertNonNegativeFinite(this.#maxDelay, "maxDelay");
    if (!Number.isFinite(this.#jitter) || this.#jitter < 0 || this.#jitter > 1) {
      throw new RangeError("jitter must be a finite number from 0 through 1.");
    }
  }

  retry(context: ConnectionRetryContext) {
    if (context.attempt > this.#maxRetries) {
      return { action: "exhaust" } as const;
    }

    const base = Math.min(this.#initialDelay * 2 ** (context.attempt - 1), this.#maxDelay);
    const factor = 1 + (this.#random() * 2 - 1) * this.#jitter;
    return {
      action: "retry",
      delay: Math.max(0, Math.round(base * factor)),
    } as const;
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number.`);
  }
}
