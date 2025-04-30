import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { EventPacket, ProgressActivity } from "../packets/index.ts";

export interface IRelayCommunication {
  addRef(): void;
  subRef(): void;
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket>;
  event(event: Nostr.Event): Observable<ProgressActivity>;
  [Symbol.dispose](): void;
}

export class RelayCommunication implements IRelayCommunication {
  constructor(public url: RelayUrl) {}
  addRef(): void {}
  subRef(): void {}
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {}
  event(event: Nostr.Event): Observable<ProgressActivity> {}
}
