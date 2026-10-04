import type { Observable } from "rxjs";

import type { ConnectionReconnector } from "../connection-reconnector/index.ts";
import type {
  EventPacket,
  EventSigner,
  EventVerifier,
  OkPacket,
  PublishEventParameters,
  RxNostrConfig,
  RxNostrReqConfig,
  RxReq,
} from "../index.ts";
import type { RxRelays } from "../rx-relays/index.ts";
import type { RelayInput } from "../types/index.ts";

/** v3-style relay entry, including the permissions supported by v3. */
export type LegacyRelay = string | { url: string; read?: boolean; write?: boolean };
export type LegacyRelayInput =
  | Iterable<LegacyRelay>
  | LegacyRelay
  | RxRelays
  | Record<string, { read?: boolean; write?: boolean }>;

export type LegacyConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "waiting-for-retrying"
  | "retrying"
  | "dormant"
  | "error"
  | "rejected"
  | "terminated";

export interface LegacyConnectionStatePacket {
  from: string;
  state: LegacyConnectionState;
}

export interface LegacyRelayStatus {
  connection: LegacyConnectionState;
}

export interface LegacyRetryConfig {
  strategy: "exponential" | "linear" | "immediately" | "off";
  maxCount?: number;
  initialDelay?: number;
  interval?: number;
  polite?: boolean;
}

export interface LegacyRxNostrConfig extends Omit<RxNostrConfig, "verifier" | "reconnector"> {
  verifier?: EventVerifier | ((event: import("nostr-typedef").Event) => Promise<boolean>);
  signer?: EventSigner;
  connectionStrategy?: "lazy" | "lazy-keep" | "aggressive";
  retry?: LegacyRetryConfig;
  disconnectTimeout?: number;
  eoseTimeout?: number;
  okTimeout?: number;
  authTimeout?: number;
  skipVerify?: boolean;
  skipValidateFilterMatching?: boolean;
  skipExpirationCheck?: boolean;
  websocketCtor?: RxNostrConfig["WebSocket"];
  reconnector?: ConnectionReconnector;
}

export interface ILegacyRxNostr {
  readonly defaultRelays: RxRelays;
  getDefaultRelays(options?: {
    filter?: "read-only" | "write-only" | "read-all" | "write-all" | "all";
  }): Record<string, { url: string; read: boolean; write: boolean }>;
  getDefaultRelay(url: string): { url: string; read: boolean; write: boolean } | undefined;
  getAllRelayStatus(): Record<string, LegacyRelayStatus>;
  getRelayStatus(url: string): LegacyRelayStatus | undefined;
  setDefaultRelays(relays: LegacyRelayInput): void;
  addDefaultRelays(relays: LegacyRelayInput): void;
  removeDefaultRelays(urls: string | string[]): void;
  setAdditionalRelays(relays: LegacyRelayInput): void;
  use(request: RxReq, options?: LegacyUseOptions): Observable<EventPacket>;
  send(event: PublishEventParameters, options?: LegacySendOptions): Observable<LegacyOkPacket>;
  cast(
    event: PublishEventParameters,
    options?: Omit<LegacySendOptions, "completeOn">,
  ): Promise<void>;
  createConnectionStateObservable(): Observable<LegacyConnectionStatePacket>;
  dispose(): void;
  [Symbol.dispose](): void;
}

export interface LegacyUseOptions extends RxNostrReqConfig {
  /** @deprecated Use `on.relays` instead. */
  relays?: string[];
  on?: { relays?: RelayInput; defaultReadRelays?: boolean };
}
export interface LegacySendOptions {
  signer?: EventSigner;
  /** @deprecated Use `on.relays` instead. */
  relays?: string[];
  on?: { relays?: RelayInput; defaultWriteRelays?: boolean };
  errorOnTimeout?: boolean;
  completeOn?: "all-ok" | "any-ok" | "sent";
  timeout?: number;
}

export type LegacyOkPacket = OkPacket & { done: boolean };
