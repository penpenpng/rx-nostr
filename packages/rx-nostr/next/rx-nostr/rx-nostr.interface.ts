import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { Authenticator } from "../authenticator/index.ts";
import type { EventSigner } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type {
  ConnectionStatePacket,
  EventPacket,
  ProgressPacket,
} from "../packets/index.ts";
import type { RetryController } from "../retry-controller/index.ts";
import type { IRxRelays } from "../rx-relays/index.ts";
import type { IRxReq } from "../rx-req/index.ts";
import type { IWebSocketConstructor } from "../websocket.ts";

export interface IRxNostr {
  req(rxReq: IRxReq, config: RxNostrReqConfig): Observable<EventPacket>;
  req(
    filters: Iterable<LazyFilter>,
    config: RxNostrReqConfig,
  ): Observable<EventPacket>;
  event(
    params: Nostr.EventParameters,
    config: RxNostrEventConfig,
  ): Observable<ProgressPacket>;
  setHotRelays(relays: IRxRelays | Iterable<string>): void;
  unsetHotRelays(): void;
  monitorConnectionState(): Observable<ConnectionStatePacket>;
  [Symbol.dispose](): void;
}

export interface RxNostrConfig {
  verifier: EventVerifier;
  signer?: EventSigner;
  authenticator?: Authenticator;
  defaultOptions?: { req?: RxNostrReqOptions; event?: RxNostrEventOptions };
  retry?: RetryController;
  authTimeout?: number;
  skipFetchNip11?: boolean;
  WebSocket?: IWebSocketConstructor;
}

export interface RxNostrReqOptions {
  defer?: boolean;
  linger?: number;
  weak?: boolean;
  timeout?: number;
  skipVerify?: boolean;
  skipValidateFilterMatching?: boolean;
  skipExpirationCheck?: boolean;
}

export interface RxNostrReqConfig extends RxNostrReqOptions {
  relays: IRxRelays | Iterable<string>;
}

export interface RxNostrEventOptions {
  signer?: EventSigner;
  weak?: boolean;
  timeout?: number;
}

export interface RxNostrEventConfig extends RxNostrEventOptions {
  relays: IRxRelays | Iterable<string>;
}
