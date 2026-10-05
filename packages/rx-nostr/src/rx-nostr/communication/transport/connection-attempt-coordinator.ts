import type {
  ConnectionReconnectorDecision,
  RelayHealth,
  RelayHealthPolicyInput,
  RelaySuppressionStrategy,
} from "../../../connection-reconnector/index.ts";
import { resolveRelaySuppressionStrategy } from "../../../connection-reconnector/relay-health-policy.ts";
import {
  copySuppressionReasons,
  type ConnectionFailure,
  type ConnectionState,
  type ConnectionSuppressionReason,
  type ConnectionWaitInfo,
} from "../../../connection-state.ts";
import type { RelayUrl } from "../../../libs/relay-urls.ts";

export interface ConnectionAttemptCoordinatorOptions {
  url: RelayUrl;
  relayHealthPolicy?: RelayHealthPolicyInput;
  getConnectionHealth?: () => RelayHealth;
  observeConnectionHealth?: (listener: () => void) => () => void;
  acquireConnectionProbe?: () => (() => void) | undefined;
}

type Decision = ConnectionReconnectorDecision;
type Decide = (report: (waiting: ConnectionWaitInfo) => void) => Decision | Promise<Decision>;

/** Combines one reconnect decision with current health; never opens a socket itself. */
export class ConnectionAttemptCoordinator {
  readonly #strategy?: RelaySuppressionStrategy;
  #releaseProbe?: () => void;

  constructor(
    readonly options: ConnectionAttemptCoordinatorOptions,
    readonly emitState: (state: ConnectionState) => void,
  ) {
    this.#strategy = resolveRelaySuppressionStrategy(options.relayHealthPolicy);
  }

  releaseProbe(): void {
    const release = this.#releaseProbe;
    this.#releaseProbe = undefined;
    release?.();
  }

  prepare(
    signal: AbortSignal,
    attempt: number,
    reason?: ConnectionFailure,
    decide?: Decide,
    fallbackHealth?: () => RelayHealth,
  ): Decision | Promise<Decision> {
    if (signal.aborted) return { action: "cancel" };
    let decision: Decision | undefined;
    let retryUntil: number | undefined;
    let reported: ConnectionWaitInfo = {};
    let settled = false;
    let update = () => {};
    const report = (waiting: ConnectionWaitInfo) => {
      if (settled || signal.aborted || decision) return;
      reported = {
        ...waiting,
        ...(waiting.suppressionReasons
          ? { suppressionReasons: copySuppressionReasons(waiting.suppressionReasons) }
          : {}),
      };
      update();
    };
    const select = (value: Decision) => {
      if (value.action === "retry") {
        if (!Number.isFinite(value.delay) || value.delay < 0)
          throw new RangeError("A retry delay must be finite and non-negative.");
        retryUntil = Date.now() + value.delay;
        reported = { suppressionReasons: copySuppressionReasons(value.suppressionReasons ?? []) };
      }
      decision = value;
    };
    const pending = decide?.(report) ?? ({ action: "retry", delay: 0 } as const);
    const asynchronous = "then" in pending;
    if (!asynchronous) select(pending);

    const evaluate = (): Decision | undefined => {
      if (signal.aborted) return { action: "cancel" };
      if (decision && decision.action !== "retry") return decision;
      const now = Date.now();
      const health = this.options.getConnectionHealth?.() ??
        fallbackHealth?.() ?? { consecutiveFailures: 0 };
      const suppression = this.#strategy?.getSuppression({
        relay: this.options.url,
        health: Object.freeze({ ...health }),
        now,
      });
      const reasons: ConnectionSuppressionReason[] = [];
      const deadlines: number[] = [];
      let blocked = !decision;
      if (suppression) {
        if (!Number.isFinite(suppression.suppressedUntil) || suppression.suppressedUntil < 0)
          throw new RangeError("A suppression deadline must be finite and non-negative.");
        const future = suppression.suppressedUntil > now;
        reasons.push({
          source: "relay-health-policy",
          kind: "relay-health",
          ...suppression.suppressionReason,
          category: "relay-health",
        });
        if (future) {
          blocked = true;
          deadlines.push(suppression.suppressedUntil);
        }
      }
      if (!decision || (retryUntil !== undefined && retryUntil > now)) {
        reasons.push(...(reported.suppressionReasons ?? []));
        if (decision && retryUntil !== undefined) {
          blocked = true;
          deadlines.push(retryUntil);
        }
      }
      if (!blocked && suppression && this.options.acquireConnectionProbe && !this.#releaseProbe) {
        this.#releaseProbe = this.options.acquireConnectionProbe();
        if (!this.#releaseProbe) {
          blocked = true;
          reasons.push({
            category: "coordination",
            source: "relay-directory",
            kind: "relay-probe",
          });
        }
      }
      if (!blocked && !reason) return decision;
      this.emitState(
        Object.freeze({
          state: "waiting-for-connection",
          attempt,
          ...(reason ? { reason } : {}),
          ...(reasons.length
            ? {
                suppressionReasons: Object.freeze(
                  copySuppressionReasons(reasons).map((r) =>
                    Object.freeze({
                      ...r,
                      ...(r.details ? { details: Object.freeze({ ...r.details }) } : {}),
                    }),
                  ),
                ),
              }
            : {}),
        }),
      );
      if (!blocked) return decision;
      if (settled || signal.aborted) return undefined;
      if (deadlines.length)
        timer = setTimeout(
          update,
          Math.min(2_147_483_647, Math.max(1, Math.min(...deadlines) - Date.now())),
        );
      return undefined;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    // Preserve synchronous initial admission when no policy is waiting.
    if (!asynchronous) {
      const result = evaluate();
      if (result) return result;
      clearTimeout(timer);
    }
    return new Promise<Decision>((resolve, reject) => {
      let unsubscribe = () => {};
      const cleanup = () => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", update);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      update = () => {
        if (settled) return;
        try {
          clearTimeout(timer);
          const result = evaluate();
          if (result) {
            settled = true;
            cleanup();
            resolve(result);
          }
        } catch (error) {
          fail(error);
        }
      };
      if (asynchronous)
        void Promise.resolve(pending).then((value) => {
          if (settled) return;
          try {
            select(value);
            update();
          } catch (error) {
            fail(error);
          }
        }, fail);
      signal.addEventListener("abort", update, { once: true });
      try {
        unsubscribe = this.options.observeConnectionHealth?.(update) ?? (() => {});
        if (settled) cleanup();
        else update();
      } catch (error) {
        fail(error);
      }
    });
  }
}
