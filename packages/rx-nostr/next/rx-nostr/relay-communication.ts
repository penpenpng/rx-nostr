import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { EventPacket, ProgressActivity } from "../packets/index.ts";

export class RelayCommunication {
  constructor(public url: RelayUrl) {}
  connect(): Promise<void> {}
  release(): void {}
  vreq(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {}
  event(event: Nostr.Event): Observable<ProgressActivity> {}
}
