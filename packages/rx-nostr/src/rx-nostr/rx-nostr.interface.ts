import type { Observable } from "rxjs";

import type { AuthenticatorInput } from "../authenticator/index.ts";
import type { ConnectionDropDetector } from "../connection-drop-detector/index.ts";
import type {
  RelayHealthPolicyInput,
  ConnectionReconnector,
} from "../connection-reconnector/index.ts";
import type { EventSigner } from "../event-signer/index.ts";
import type { EventVerifier } from "../event-verifier/index.ts";
import type { ConnectionStatePacket, EventPacket } from "../packets/index.ts";
import type { Publication, PublishEventParameters } from "../publication/index.ts";
import type { RelayDirectory } from "../relay-directory/index.ts";
import type { RelayInput, WebSocketConstructor } from "../types/index.ts";
import type {
  RxNostrPublishConfig,
  RxNostrPublishOptions,
  RxNostrReqConfig,
  RxNostrReqInput,
  RxNostrReqOptions,
} from "./operation/index.ts";

export interface IRxNostr {
  forward(
    relays: RelayInput,
    request: RxNostrReqInput,
    options?: RxNostrReqConfig,
  ): Observable<EventPacket>;
  backward(
    relays: RelayInput,
    request: RxNostrReqInput,
    options?: RxNostrReqConfig,
  ): Observable<EventPacket>;
  publish(
    relays: RelayInput,
    params: PublishEventParameters,
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
  verifier?: EventVerifier;
  /**
   * Default signer, which is used to convert event parameters into signed event.
   */
  signer?: EventSigner;
  /** Override the process-wide authenticator, or disable AUTH for this instance. */
  authenticator?: AuthenticatorInput | false;
  /** Defaults applied to REQ and publish operations owned by this instance. */
  defaultOptions?: RxNostrDefaultOptions;
  /**
   * Auto reconnection controller.
   */
  reconnector?: ConnectionReconnector;
  /** Additional detectors that may report a ready connection as dropped. */
  dropDetectors?: Iterable<ConnectionDropDetector>;
  /** Shared relay metadata and health directory. */
  /** A RelayDirectory instance (or subclass calling super), shared or isolated. IRelayDirectory alone is not injectable. */
  relayDirectory?: RelayDirectory;
  /** Numeric options or a custom suppression strategy. false disables health suppression. */
  relayHealthPolicy?: RelayHealthPolicyInput;
  /** Maximum duration of one WebSocket connection attempt in milliseconds. Defaults to 30 seconds. */
  connectionTimeout?: number;
  /** Maximum time to wait for automatic NIP-11 retrieval. Defaults to 30 seconds. */
  nip11Timeout?: number;
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
  publish: Required<Omit<RxNostrPublishOptions, "signer">>;
}

/** Process-wide defaults for constructor-level configuration. */
export interface RxNostrStaticDefaultConfig {
  verifier: EventVerifier;
  signer: EventSigner;
  authenticator: AuthenticatorInput | undefined;
  reconnector: ConnectionReconnector;
  dropDetectors: ConnectionDropDetector[];
  relayDirectory: RelayDirectory;
  relayHealthPolicy: RelayHealthPolicyInput;
  connectionTimeout: number;
  nip11Timeout: number;
  skipFetchNip11: boolean;
  WebSocket: WebSocketConstructor | undefined;
}
