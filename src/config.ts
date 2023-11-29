import { defineDefault } from "./util.js";

export const makeRxNostrConfig = defineDefault<RxNostrConfig>({
  retry: {
    strategy: "exponential",
    maxCount: 5,
    initialDelay: 1000,
  },
  timeout: 10000,
  skipVerify: false,
  skipValidateFilterMatching: false,
  skipFetchNip11: false,
});

export interface RxNostrConfig {
  /** Auto reconnection strategy. */
  retry: RetryConfig;
  /**
   * The time in milliseconds to timeout when following the backward strategy.
   * The observable is terminated when the specified amount of time has elapsed
   * during which no new events are available.
   */
  timeout: number;
  skipVerify: boolean;
  skipValidateFilterMatching: boolean;
  skipFetchNip11: boolean;
}
/** @deprecated Use `RxNostrConfig` instead. */
export type RxNostrOptions = RxNostrConfig;

export type RetryConfig =
  | {
      // Exponential backoff and jitter strategy
      strategy: "exponential";
      maxCount: number;
      initialDelay: number;
    }
  | {
      // Retry at regular intervals
      strategy: "linear";
      maxCount: number;
      interval: number;
    }
  | {
      // Retry immediately
      strategy: "immediately";
      maxCount: number;
    }
  | {
      // Won't retry
      strategy: "off";
    };
