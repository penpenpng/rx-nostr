import { defineDefault } from "./utils.js";

export const makeRxNostrConfig = defineDefault<RxNostrConfig>({
  keepAliveDefaultRelayConnections: false,
  retry: {
    strategy: "exponential",
    maxCount: 5,
    initialDelay: 1000,
  },
  eoseTimeout: 30 * 1000,
  okTimeout: 30 * 1000,
  skipVerify: false,
  skipValidateFilterMatching: false,
  skipFetchNip11: false,
});

/**
 * Configuration object for a RxNostr instance.
 */
export interface RxNostrConfig {
  /**
   * If true, default relays don't get to `"dormant"` state.
   *
   * Normally, rx-nostr will temporarily close a WebSocket connection on relays
   * when there is no more active communication going on over it.
   * This option disables this behavior **only for default relays**.
   *
   * Temporary relays specified within `use()`'s options get `"dormant"`
   * when they are no longer used.
   */
  keepAliveDefaultRelayConnections: boolean;
  /**
   * Auto reconnection strategy.
   */
  retry: RetryConfig;
  /**
   * Specify how long rx-nostr waits for EOSE messages in `use()` following backward strategy (milliseconds).
   *
   * If EOSE doesn't come after waiting for this amount of time,
   * rx-nostr is considered to get EOSE.
   */
  eoseTimeout: number;
  /**
   * Specify how long rx-nostr waits for OK messages in `send()` (milliseconds).
   *
   * If OK doesn't come after waiting for this amount of time,
   * rx-nostr stops listening OK and the Observable come from `send()` finishes with TimeoutError.
   */
  okTimeout: number;
  /**
   * If true, skip filtering EVENTs based on signature verification.
   */
  skipVerify: boolean;
  /**
   * If true, skip filtering EVENTs based on matching with REQ filter.
   */
  skipValidateFilterMatching: boolean;
  /**
   * If true, skip automatic fetching NIP-11 relay information.
   */
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
/** @deprecated Use `RxNostrConfig` instead. */
export type BackoffConfig = RetryConfig;
