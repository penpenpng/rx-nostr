import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { AuthenticatorInput } from "../authenticator/index.ts";
import type { ConnectionRetryer } from "../connection-retryer/index.ts";
import type { EventSigner } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { ConnectionStatePacket, EventPacket } from "../packets/index.ts";
import type { Publication } from "../publication/index.ts";
import type { RelayDirectory } from "../relay-directory/index.ts";
import type { RxReq } from "../rx-req/index.ts";
import type { RelayInput, WebSocketConstructor } from "../types/index.ts";

export interface IRxNostr {
  req(relays: RelayInput, rxReq: RxReq, options?: RxNostrReqConfig): Observable<EventPacket>;
  req(
    relays: RelayInput,
    filters: LazyFilter | Iterable<LazyFilter>,
    options?: RxNostrReqConfig,
  ): Observable<EventPacket>;
  publish(
    relays: RelayInput,
    params: Nostr.EventParameters,
    options?: RxNostrPublishConfig,
  ): Publication;
  setHotRelays(relays: RelayInput): void;
  unsetHotRelays(): void;
  monitorConnectionState(): Observable<ConnectionStatePacket>;
  [Symbol.dispose](): void;
  dispose(): void;
}

export interface RxNostrConfig {
  /**
   * Default verifier, which is used to verify event's signature.
   */
  verifier: EventVerifier;
  /**
   * Default signer, which is used to convert event parameters into signed event.
   */
  signer?: EventSigner;
  authenticator?: AuthenticatorInput;
  /** Defaults applied to REQ and publish operations owned by this instance. */
  defaultOptions?: RxNostrDefaultOptions;
  /**
   * Auto reconnection controller.
   */
  retry?: ConnectionRetryer;
  /** Shared relay metadata and health directory. */
  relayDirectory?: RelayDirectory;
  /**
   * If true, skip automatic fetching NIP-11 relay information.
   */
  skipFetchNip11?: boolean;
  /**
   * Optional. For environments where `WebSocket` doesn't exist in `globalThis` such as Node.js.
   */
  WebSocket?: WebSocketConstructor;
}

export interface RxNostrDefaultOptions {
  req?: RxNostrReqOptions;
  publish?: RxNostrPublishOptions;
}

export interface RxNostrStaticDefaultOptions {
  req: Required<RxNostrReqOptions>;
  publish: Required<Omit<RxNostrPublishOptions, "signer">> & Pick<RxNostrPublishOptions, "signer">;
}

export interface RxNostrReqOptions {
  defer?: boolean;
  linger?: number;
  weak?: boolean;
  /**
   * Specify how long rx-nostr waits for EOSE messages when following backward strategy (milliseconds).
   *
   * If EOSE doesn't come after waiting for this amount of time,
   * rx-nostr is considered to get EOSE.
   */
  timeout?: number;
  /**
   * If true, skip filtering EVENTs based on matching with REQ filter.
   */
  skipValidateFilterMatching?: boolean;
  /**
   * If true, skip automatic expiration check based on NIP-40.
   */
  skipExpirationCheck?: boolean;
}

export interface RxNostrReqConfig extends RxNostrReqOptions {
  verifier?: EventVerifier;
  /** Override the instance authenticator, or disable AUTH for this operation. */
  authenticator?: AuthenticatorInput | false;
}

export interface RxNostrPublishOptions {
  signer?: EventSigner;
  linger?: number;
  weak?: boolean;
  /**
   * Specify how long rx-nostr waits for OK messages (milliseconds).
   *
   * If OK doesn't come after waiting for this amount of time, rx-nostr stops listening OK.
   */
  timeout?: number;
}

export interface RxNostrPublishConfig extends RxNostrPublishOptions {
  /** Override the instance authenticator, or disable AUTH for this operation. */
  authenticator?: AuthenticatorInput | false;
}
