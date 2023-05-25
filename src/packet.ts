import { Nostr } from "./nostr/primitive";

// Packet is data treated by rx-nostr Observables.

/**
 * Packets flowing through the Observable stream sent from RxReq towards RxNostr.
 * When null is sent, the subscription is suspended.
 */
export type ReqPacket = Nostr.Filter[] | null;

/**
 * Packets from websocket that represents an EVENT.
 */
export interface EventPacket {
  from: string;
  subId: string;
  event: Nostr.Event;
}

/**
 * Packets from websocket that represents an error.
 */
export interface ErrorPacket {
  from: string;
  reason: unknown;
}

/**
 * Packets from websocket that represents all raw incoming messages.
 */
export interface MessagePacket {
  from: string;
  message: Nostr.IncomingMessage.Any;
}

export interface ConnectionStatePacket {
  from: string;
  state: ConnectionState;
}

export type ConnectionState =
  | "not-started" // Not started yet.
  | "starting" // The first trying to connect.
  | "ongoing" // Active, but may be temporarily closed as idling.
  | "reconnecting" // Trying to reconnect for error recovery.
  | "error" // Inactive because of an error. You can try to recover by reconnect()
  | "terminated";
