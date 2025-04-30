import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { EventSigner } from "../event-signer/event-signer.interface.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { EventPacket, ProgressPacket } from "../packets/index.ts";
import type { IRxRelays } from "../rx-relays/index.ts";
import type { IRxReq } from "../rx-req/index.ts";

export interface IRxNostr {
  req(rxReq: IRxReq, config: ReqConfig): Observable<EventPacket>;
  req(
    filters: Iterable<LazyFilter>,
    config: ReqConfig,
  ): Observable<EventPacket>;
  event(
    params: Nostr.EventParameters,
    config: EventConfig,
  ): Observable<ProgressPacket>;
  keep(rxRelays: IRxRelays): void;
  release(rxRelays: IRxRelays): void;
  [Symbol.dispose](): void;
  /**
   * Alias for `[Symbol.dispose]()`
   */
  dispose(): void;
}

export interface ReqConfig {
  relays: IRxRelays | Iterable<string>;
  defer?: boolean;
  linger?: number;
}

export interface EventConfig {
  relays: IRxRelays | Iterable<string>;
  signer?: EventSigner;
}
