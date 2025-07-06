import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { EventPacket, ProgressActivity } from "../packets/index.ts";

export class RelayCommunication {
  /**
   * Reference counter.
   *
   * As long as the counter holds a positive value,
   * efforts will be made to upkeep the WebSocket connection.
   * Any transmission attempts made while the counter was positive
   * but the connection was not yet established
   * will be scheduled for retransmission at an appropriate time.
   */
  private refs: unknown;

  constructor(public url: RelayUrl) {}

  /**
   * Increment the reference counter.
   *
   * If this causes the counter to become positive,
   * an attempt will be made to establish the WebSocket connection.
   *
   * Returns a Promise that resolves upon successful connection,
   * or resolves immediately if the connection is already established.
   */
  connect(): Promise<void> {}

  /**
   * Decrement the reference counter.
   *
   * If this causes the counter to become zero,
   * the WebSocket connection will be closed.
   */
  release(): void {}

  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {}

  event(event: Nostr.Event): Observable<ProgressActivity> {}
}
