import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { EventPacket, ProgressActivity } from "../packets/index.ts";
import type { RelayCommunication } from "./relay-communication.ts";

export class CommunicationFacade {
  forEach(
    relays: Iterable<RelayUrl> | undefined,
    callback: (relay: RelayCommunication) => void,
  ): void;

  // addRef(relays: Iterable<RelayUrl>): void;
  // subRef(relays: Iterable<RelayUrl>): void;
  // vreq(
  //   relays: Iterable<RelayUrl>,
  //   strategy: "forward" | "backward",
  //   filters: LazyFilter[],
  // ): Observable<EventPacket>;
  // event(
  //   relays: Iterable<RelayUrl>,
  //   event: Nostr.Event,
  // ): Observable<ProgressActivity>;
  // [Symbol.dispose](): void;
}
