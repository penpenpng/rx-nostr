import { defineDefault } from "../utils.js";
import type { IWebSocketConstructor } from "../websocket.js";
import { AuthenticatorConfig } from "./authenticator.js";
import { EventSigner, nip07Signer } from "./signer.js";
import { EventVerifier, verifier } from "./verifier.js";

export const makeRxNostrConfig = defineDefault<RxNostrConfig>({
  signer: nip07Signer(),
  verifier: verifier,
  authenticator: undefined,
  connectionStrategy: "lazy",
  retry: {
    strategy: "exponential",
    maxCount: 5,
    initialDelay: 1000,
  },
  eoseTimeout: 30 * 1000,
  okTimeout: 30 * 1000,
  authTimeout: 30 * 1000,
  skipVerify: false,
  skipValidateFilterMatching: false,
  skipExpirationCheck: false,
  acceptDelegatedEvent: false,
  skipFetchNip11: false,
  websocketCtor: undefined,
});

/**
 * Configuration object for a RxNostr instance.
 */
export interface RxNostrConfig {
  /**
   * Default signer, which is used to convert event parameters into signed event.
   */
  signer: EventSigner;
  /**
   * Default verifier, which is used to verify event's signature.
   */
  verifier: EventVerifier;
  authenticator:
    | AuthenticatorConfig
    | ((relay: string) => AuthenticatorConfig)
    | undefined;

  /**
   * Connection strategy for default relays.
   */
  connectionStrategy: ConnectionStrategy;

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
  authTimeout: number;
  /**
   * If true, skip filtering EVENTs based on signature verification.
   */
  skipVerify: boolean;
  /**
   * If true, skip filtering EVENTs based on matching with REQ filter.
   */
  skipValidateFilterMatching: boolean;
  /**
   * If true, skip automatic expiration check based on NIP-40.
   */
  skipExpirationCheck: boolean;
  /**
   * If true, skip automatic fetching NIP-11 relay information.
   */
  skipFetchNip11: boolean;
  /**
   * If true, delegated events are treated as events issued by the delegator.
   */
  acceptDelegatedEvent: boolean;
  /**
   * Optional. For environments where `WebSocket` doesn't exist in `globalThis` such as Node.js.
   */
  websocketCtor: IWebSocketConstructor | undefined;
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

/**
 * Connection strategy for default relays.
 *
 * - `"lazy"`: Connect when needed, and disconnect when unneeded.
 * - `"lazy-keep"`: Connect when needed, when the relay gets to be non-default and it is unneeded.
 * - `"aggressive"`: Connect immediately, and disconnect when the relay gets to be non-default and it is unneeded.
 */
export type ConnectionStrategy = "lazy" | "lazy-keep" | "aggressive";
