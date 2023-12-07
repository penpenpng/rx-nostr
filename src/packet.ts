import Nostr from "nostr-typedef";

// Packet is data treated by rx-nostr Observables.

/**
 * Packets flowing through the Observable stream sent from RxReq towards RxNostr.
 * When null is sent, the subscription is suspended.
 */
export type ReqPacket = LazyFilter[] | null;

/**
 * Filter object, but allows parameters since/until to be function.
 * If so, values will be evaluated just before submission.
 */
export type LazyFilter = Omit<Nostr.Filter, "since" | "until"> & {
  since?: number | (() => number);
  until?: number | (() => number);
};

/** @internal */
export type LazyREQ = ["REQ", string, ...LazyFilter[]];

/**
 * Packets from websocket that represents all raw incoming messages.
 */
export type MessagePacket =
  | EventPacket
  | EosePacket
  | OkPacket
  | ClosedPacket
  | NoticePacket
  | AuthPacket
  | CountPacket;

export interface MessagePacketBase<
  T extends Nostr.ToClientMessage.Type = Nostr.ToClientMessage.Type
> {
  from: string;
  type: T;
  message: Nostr.ToClientMessage.Message<T>;
}

/**
 * Packets from websocket that represents an EVENT.
 */
export interface EventPacket extends MessagePacketBase<"EVENT"> {
  subId: string;
  event: Nostr.Event;
}

export interface EosePacket extends MessagePacketBase<"EOSE"> {
  subId: string;
}

export interface ClosedPacket extends MessagePacketBase<"CLOSED"> {
  subId: string;
  notice: string;
}

/**
 * Packets represents OK messages associated with an EVENT submission.
 */
export interface OkPacket extends MessagePacketBase<"OK"> {
  /** @deprecated Use `eventId` instead. */
  id: string;
  eventId: string;
  ok: boolean;
  notice?: string;
}

export interface NoticePacket extends MessagePacketBase<"NOTICE"> {
  notice: string;
}

export interface AuthPacket extends MessagePacketBase<"AUTH"> {
  challengeMessage: string;
}

export interface CountPacket extends MessagePacketBase<"COUNT"> {
  subId: string;
  count: Nostr.CountResponse;
}

/**
 * Packets from websocket that represents an error.
 */
export interface ErrorPacket {
  from: string;
  reason: unknown;
}

/**
 * Packets emitted when WebSocket connection state is changed.
 */
export interface ConnectionStatePacket {
  from: string;
  state: ConnectionState;
}

export interface OutgoingMessagePacket {
  to: string;
  message: Nostr.ToRelayMessage.Any;
}

/**
 * State of a WebSocket connection established with a relay.
 *
 * - `initialized`: Initialization has been completed and the connection can now be made.
 * - `connecting`: Attempting to connect for reasons other than auto-retry.
 * - `connected`: Connected.
 * - `waiting-for-retrying`: Closed unexpectedly and the next auto-retry is scheduled.
 * - `retrying`: Attempting to connect because of auto-retry.
 * - `dormant`: Closed temporary because there is no acitve messaging.
 * - `error`: Closed unexpectedly after the maximum number of retries. You can try to `reconnect()` manually.
 * - `rejected`: Closed by a relay with closing code 4000. You can try to reconnect, but should not do.
 * - `terminated`: Closed because of `dispose()`. Never reconnect.
 */
export type ConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "waiting-for-retrying"
  | "retrying"
  | "dormant"
  | "error"
  | "rejected"
  | "terminated";
