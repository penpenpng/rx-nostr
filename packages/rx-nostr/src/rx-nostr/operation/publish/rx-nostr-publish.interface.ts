import type { EventSigner } from "../../../event-signer/index.ts";

export interface RxNostrPublishOptions {
  signer?: EventSigner;
  linger?: number;
  weak?: boolean;
  /**
   * Specify how long rx-nostr waits for OK messages (milliseconds).
   *
   * If OK doesn't come after waiting for this amount of time, rx-nostr stops listening OK.
   */
  timeout?: number;
}

export interface RxNostrPublishConfig extends RxNostrPublishOptions {}
