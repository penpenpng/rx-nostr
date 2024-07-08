import * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";

import type { EventSigner } from "../config/signer.js";
import type {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  MessagePacket,
  OkPacketAgainstEvent,
  OutgoingMessagePacket,
} from "../packet.js";
import { defineDefault } from "../utils.js";
import type { RxReq } from "./rx-req.js";

/**
 * The core object of rx-nostr, which holds a connection to relays
 * and manages subscriptions as directed by the RxReq object connected by `use()`.
 * Use `createRxNostr()` to get the object.
 */
export interface RxNostr {
  /**
   * Return config objects of the default relays used by this object.
   * The relay URLs are normalised so may not match the URLs set.
   *
   * **NOTE**:
   * The record's keys are **normalized** URL, so may be different from ones you set.
   * Use `getDefaultRelay(url)` instead to ensure that you get the value associated with a given URL.
   */
  getDefaultRelays(): Record<string, DefaultRelayConfig>;
  /**
   * Return a config object of the given relay if it exists.
   */
  getDefaultRelay(url: string): DefaultRelayConfig | undefined;

  /**
   * Set the list of default relays. Existing default relays **will be overwritten**.
   *
   * If a REQ subscription for default relays already exists,
   * the same REQ will be issued for the newly added relay
   * and CLOSE will be sent for the removed relay.
   */
  setDefaultRelays(relays: AcceptableDefaultRelaysConfig): void;
  /** Utility wrapper for `setDefaultRelays()`. */
  addDefaultRelays(relays: AcceptableDefaultRelaysConfig): void;
  /** Utility wrapper for `setDefaultRelays()`. */
  removeDefaultRelays(urls: string | string[]): void;

  /**
   * Return relay status of all default relays and all relays that RxNostr has used temporary.
   *
   * **NOTE**:
   * Keys are **normalized** URL, so may be different from ones you set.
   * Use `getRelayState(url)` instead to ensure that you get the value associated with a given URL.
   */
  getAllRelayStatus(): Record<string, RelayStatus>;
  /**
   * Return relay status of the given relay if it exists.
   */
  getRelayStatus(url: string): RelayStatus | undefined;

  /**
   * Attempt to reconnect manually if its connection state is `error` or `rejected`.
   *
   * If not, do nothing.
   */
  reconnect(url: string): void;

  /**
   * Associate RxReq with RxNostr.
   *
   * When the associated RxReq is manipulated, the RxNostr sends a new REQ to relays.
   * This method returns an Observable that emits the REQ query's responses.
   *
   * You can unsubscribe the Observable to send CLOSE.
   */
  use(
    rxReq: RxReq,
    options?: Partial<RxNostrUseOptions>,
  ): Observable<EventPacket>;
  /**
   * Create an Observable that receives all events (EVENT) from all websocket connections.
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllEventObservable(): Observable<EventPacket>;
  /**
   * Create an Observable that receives all errors from all websocket connections.
   *
   * Note that this method is the only way to receive errors arising from multiplexed websocket connections.
   * (It means that Observables returned by `use()` never throw error).
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllErrorObservable(): Observable<ErrorPacket>;
  /**
   * Create an Observable that receives all messages from all websocket connections.
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllMessageObservable(): Observable<MessagePacket>;
  /**
   * Create an Observable that receives changing of WebSocket connection state.
   *
   * Nothing happens when this Observable is unsubscribed.
   */
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;
  /**
   * Create an Observable that receives all message sent to websocket connections.
   *
   * Nothing happens when this Observable is unsubscribed.
   */
  createOutgoingMessageObservable(): Observable<OutgoingMessagePacket>;

  /**
   * Attempt to send events to relays.
   *
   * The `seckey` option accepts both nsec format and hex format,
   * and if omitted NIP-07 will be automatically used.
   */
  send(
    params: Nostr.EventParameters,
    options?: RxNostrSendOptions,
  ): Observable<OkPacketAgainstEvent>;

  /**
   * Release all resources held by the RxNostr object.
   *
   * Any Observable resulting from this RxNostr will be in the completed state
   * and will never receive messages again.
   * RxReq used by this object is not affected; in other words, if the RxReq is used
   * by another RxNostr, its use is not prevented.
   */
  [Symbol.dispose](): void;

  /**
   * Shorthand for `[Symbol.dispose]()`
   */
  dispose(): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RxNostrUseOptions {
  relays?: string[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const makeRxNostrUseOptions = defineDefault<RxNostrUseOptions>({
  relays: undefined,
});

export interface RxNostrSendOptions {
  signer?: EventSigner;
  relays?: string[];
}
export const makeRxNostrSendOptions = defineDefault<RxNostrSendOptions>({
  relays: undefined,
});

/** Config object specifying default relays' behaviors. */
export interface DefaultRelayConfig {
  /** WebSocket endpoint URL. */
  url: string;
  /** If true, rxNostr can publish REQ and subscribe EVENTs. */
  read: boolean;
  /** If true, rxNostr can send EVENTs. */
  write: boolean;
}

/** Parameter of `rxNostr.setDefaultRelays()` */
export type AcceptableDefaultRelaysConfig =
  | (
      | string
      | string[] /* ["r", url: string, mode?: "read" | "write"] */
      | DefaultRelayConfig
    )[]
  | Nostr.Nip07.GetRelayResult;

export interface RelayStatus {
  connection: ConnectionState;
}
