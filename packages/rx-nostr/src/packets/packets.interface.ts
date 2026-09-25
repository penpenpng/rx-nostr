import * as Nostr from "nostr-typedef";

import type { ConnectionState } from "../connection-state.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { RelayInput } from "../types/index.ts";

/**
 * Packets flowing through the Observable stream sent from RxReq towards RxNostr.
 * When null is sent, the subscription is suspended.
 *
 * **NOTE**: The internal structure of ReqPacket is subject to change.
 * Do NOT create RxPackets directly, but issue RxPackets through RxReq instead.
 */
export interface ReqPacket extends ReqOptions {
  filters: LazyFilter[];
}

export interface ReqOptions {
  relays?: RelayInput;
  linger?: number;
  traceTag?: string | number;
}

/**
 * Packets from websocket that represents all raw incoming messages.
 */
export type MessagePacket =
  | EventMessagePacket
  | EosePacket
  | OkPacket
  | ClosedPacket
  | NoticePacket
  | AuthPacket
  | CountPacket
  | UnknownMessagePacket;

export interface MessagePacketBase<
  T extends Nostr.ToClientMessage.Type = Nostr.ToClientMessage.Type,
> {
  from: RelayUrl;
  type: T;
  message: Nostr.ToClientMessage.Message<T>;
}

/**
 * A public query result. Wire-level subscription identifiers and their raw
 * tuples are intentionally kept out of this type.
 */
export interface EventPacket {
  from: RelayUrl;
  type: "EVENT";
  traceTag?: string | number;
  event: Nostr.Event;
}

/** @internal */
export interface EventMessagePacket extends MessagePacketBase<"EVENT"> {
  subId: string;
  event: Nostr.Event;
}

export interface EosePacket extends MessagePacketBase<"EOSE"> {
  subId: string;
}

export interface ClosedPacket extends MessagePacketBase<"CLOSED"> {
  subId: string;
  notice: string;
  noticeType?: Nostr.MachineReadablePrefix;
}

/**
 * Packets represents OK messages associated with an EVENT submission.
 */
export interface OkPacket extends MessagePacketBase<"OK"> {
  eventId: string;
  ok: boolean;
  notice?: string;
  noticeType?: Nostr.MachineReadablePrefix;
}

export interface UnknownMessagePacket {
  from: RelayUrl;
  type: "unknown";
  message: unknown;
}

export interface NoticePacket extends MessagePacketBase<"NOTICE"> {
  notice: string;
}

export interface AuthPacket extends MessagePacketBase<"AUTH"> {
  challenge: string;
}

export interface CountPacket extends MessagePacketBase<"COUNT"> {
  subId: string;
  count: Nostr.CountResponse;
}

/**
 * Packets from websocket that represents an error.
 */
export interface ErrorPacket {
  from: RelayUrl;
  reason: unknown;
}

/**
 * Packets emitted when WebSocket connection state is changed.
 */
export interface ConnectionStatePacket {
  from: RelayUrl;
  state: ConnectionState;
}
