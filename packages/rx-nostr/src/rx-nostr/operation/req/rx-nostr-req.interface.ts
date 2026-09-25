import type { AuthenticatorInput } from "../../../authenticator/index.ts";
import type { EventVerifier } from "../../../event-verifier/index.ts";
import type { LazyFilter } from "../../../lazy-filter/index.ts";
import type { RxReq } from "../../../rx-req/index.ts";

export type RxNostrReqInput =
  | RxReq
  | Readonly<{
      strategy: "forward";
      filters: LazyFilter | Iterable<LazyFilter>;
    }>
  | Readonly<{
      strategy: "oneshot";
      filters: LazyFilter | Iterable<LazyFilter>;
    }>;

export interface RxNostrReqOptions {
  defer?: boolean;
  linger?: number;
  weak?: boolean;
  /**
   * Specify how long rx-nostr waits for EOSE messages when following backward strategy (milliseconds).
   *
   * If EOSE doesn't come after waiting for this amount of time,
   * rx-nostr is considered to get EOSE.
   */
  timeout?: number;
  /**
   * If true, skip filtering EVENTs based on matching with REQ filter.
   */
  skipValidateFilterMatching?: boolean;
  /**
   * If true, skip automatic expiration check based on NIP-40.
   */
  skipExpirationCheck?: boolean;
}

export interface RxNostrReqConfig extends RxNostrReqOptions {
  verifier?: EventVerifier;
  /** Override the instance authenticator, or disable AUTH for this operation. */
  authenticator?: AuthenticatorInput | false;
}
