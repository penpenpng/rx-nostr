import type * as Nostr from "nostr-typedef";
import type { Observer, Subscription } from "rxjs";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { OkPacket } from "../packets/index.ts";

export type PublicationSettlePolicy = "all" | "any";

export type PublicationFailure = Readonly<{
  relay: RelayUrl;
  kind: "rejected" | "timeout" | "dropped" | "retry-exhausted" | "cancelled" | "auth" | "failed";
  ok?: OkPacket;
  cause?: unknown;
}>;

/** A publish operation that starts when `RxNostr.publish()` is called. */
export interface Publication {
  /** The immutable event snapshot that the operation attempted to send. */
  readonly event: Promise<Readonly<Nostr.Event>>;

  /** Observe unaggregated OK packets without controlling the operation. */
  subscribe(observer?: Partial<Observer<OkPacket>>): Subscription;
  subscribe(
    next?: ((value: OkPacket) => void) | null,
    error?: ((error: unknown) => void) | null,
    complete?: (() => void) | null,
  ): Subscription;

  /** Idempotently stop every remaining send effort. */
  cancel(): void;

  /**
   * Resolve with `undefined` when the policy succeeds and reject with a typed
   * rx-nostr error when it can no longer succeed.
   */
  waitFor(policy: PublicationSettlePolicy): Promise<void>;
}
