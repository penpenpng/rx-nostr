import { defineDefault } from "./utils.js";

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

/**
 * Configuration object for a RxNostr instance.
 */
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

/**
 * Auto reconnection strategy.
 *
 * `strategy` can be one of the followings:
 *
 * - `"exponential"`: Exponential backoff and jitter strategy.
 * - `"linear"`: Retry at regular intervals.
 * - `"immediately"`: Retry immediately.
 * - `"off"`: Won't retry.
 *
 * `maxCount` specifies the maximum number of consecutive retry attempts.
 */
export type RetryConfig =
  | {
      strategy: "exponential";
      maxCount: number;
      initialDelay: number;
    }
  | {
      strategy: "linear";
      maxCount: number;
      interval: number;
    }
  | {
      strategy: "immediately";
      maxCount: number;
    }
  | {
      strategy: "off";
    };
