import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressActivity,
} from "../packets/index.ts";

export interface IRelayConnection {
  connect(): Promise<void>;
  req(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket>;
  event(event: Nostr.Event): Observable<ProgressActivity>;
  monitorConnectionState(): Observable<ConnectionStatePacket>;
  [Symbol.dispose](): void;
}

export class RelayConnection implements IRelayConnection {
  connect(): Promise<void> {}
  req(
    strategy: "forward" | "backward",
    filters: LazyFilter[],
  ): Observable<EventPacket> {}

  event(event: Nostr.Event): Observable<ProgressActivity> {}
  monitorConnectionState(): Observable<ConnectionStatePacket> {}
}
