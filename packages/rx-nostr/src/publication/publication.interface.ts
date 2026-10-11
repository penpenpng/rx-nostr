import type * as Nostr from "nostr-typedef";
import type { Observer, Subscription } from "rxjs";

import type { RelayUrl } from "../libs/relay-urls.ts";
import type { OkPacket } from "../packets/index.ts";

export type PublicationSettlePolicy = "all" | "any";

/** Event parameters accepted by publish(). Omitted content is published as an empty string. */
export type PublishEventParameters = Omit<Nostr.EventParameters, "content"> & {
  content?: string;
};

export type PublicationFailure = {
  relay: RelayUrl;
  kind: "rejected" | "timeout" | "dropped" | "retry-exhausted" | "cancelled" | "auth" | "failed";
  ok?: OkPacket;
  cause?: unknown;
};

/** A publish operation that starts when `RxNostr.publish()` is called. */
export interface Publication {
  /** One detached copy of the signed event, shared by every await of this Promise. */
  readonly event: Promise<Nostr.Event>;

  /** Observe unaggregated OK packets as independent mutable copies, including replay. The stream completes after every relay effort ends or the publication is cancelled. */
  subscribe(observer?: Partial<Observer<OkPacket>>): Subscription;
  subscribe(
    next?: ((value: OkPacket) => void) | null,
    error?: ((error: unknown) => void) | null,
    complete?: (() => void) | null,
  ): Subscription;

  /** Idempotently stop every remaining send effort and release owned demand synchronously. A WebSocket close handshake may finish later. */
  cancel(): void;

  /**
   * Resolve with `undefined` when the policy succeeds and reject with a typed
   * rx-nostr error when it can no longer succeed. Settlement does not stop
   * other relay efforts or wait for linger cleanup.
   */
  waitFor(policy: PublicationSettlePolicy): Promise<void>;
}
