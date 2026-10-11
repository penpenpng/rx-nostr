import type { EventSigner } from "../../../event-signer/index.ts";

export interface RxNostrPublishOptions {
  signer?: EventSigner;
  /** Connection-demand retention in ms; 0 releases immediately, Infinity lasts until disposal. */
  linger?: number;
  weak?: boolean;
  /**
   * Specify how long rx-nostr waits for OK messages (milliseconds).
   *
   * If OK doesn't come after waiting for this amount of time, rx-nostr stops listening OK.
   * 0 is immediate; Infinity disables the deadline.
   */
  timeout?: number;
}

export interface RxNostrPublishConfig extends RxNostrPublishOptions {}
