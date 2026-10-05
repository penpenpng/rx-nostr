import { ExponentialBackoffReconnector, NoopReconnector } from "../connection-reconnector/index.ts";
import type { ConnectionReconnector } from "../connection-reconnector/index.ts";
import type { LegacyRetryConfig } from "./types.ts";

export function legacyRetryReconnector(retry: LegacyRetryConfig): ConnectionReconnector {
  if (retry.strategy === "off") return new NoopReconnector();

  const shouldSkipInitialAttempt = (context: Parameters<ConnectionReconnector["reconnect"]>[0]) =>
    retry.polite && context.phase === "initial" && context.health.lastConnectedAt === undefined;

  if (retry.strategy === "exponential") {
    const backoff = new ExponentialBackoffReconnector({
      maxRetries: retry.maxCount ?? 5,
      initialDelay: retry.initialDelay,
    });
    return {
      reconnect(context) {
        if (shouldSkipInitialAttempt(context)) return { action: "cancel" };
        return backoff.reconnect(context);
      },
    };
  }

  return {
    reconnect(context) {
      if (shouldSkipInitialAttempt(context)) return { action: "cancel" };
      if (context.attempt > (retry.maxCount ?? 5)) return { action: "exhaust" };
      return {
        action: "retry",
        delay: retry.strategy === "immediately" ? 0 : (retry.interval ?? 1_000),
      };
    },
  };
}
