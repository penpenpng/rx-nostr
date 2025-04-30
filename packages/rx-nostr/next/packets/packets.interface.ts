import * as Nostr from "nostr-typedef";

import type { ConnectionState } from "../connection-state.ts";
import type { LazyFilter } from "../lazy-filter/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { RxRelays } from "../rx-relays/index.ts";

/**
 * Packets flowing through the Observable stream sent from RxReq towards RxNostr.
 * When null is sent, the subscription is suspended.
 *
 * **NOTE**: The internal structure of ReqPacket is subject to change.
 * Do NOT create RxPackets directly, but issue RxPackets through RxReq instead.
 */
export interface ReqPacket {
  filters: LazyFilter[];
  relays?: RxRelays | Iterable<string>;
  linger?: number;
}

export interface ProgressPacket {
  activity: ProgressActivity;
  progress: Map<RelayUrl, ProgressInitialState | ProgressActivity>;
  success: number;
  failure: number;
}

export interface ProgressInitialState {
  state: "waiting";
  relay: RelayUrl;
}

export interface ProgressActivity {
  state: "sent" | "ok" | "timeout";
  relay: RelayUrl;
  ok?: boolean;
  reason?: "timeout" | "auth";
}

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
 * Packets from websocket that represents an EVENT.
 */
export interface EventPacket extends MessagePacketBase<"EVENT"> {
  event: Nostr.Event;
}

export interface EosePacket extends MessagePacketBase<"EOSE"> {}

export interface ClosedPacket extends MessagePacketBase<"CLOSED"> {
  notice: string;
}

/**
 * Packets represents OK messages associated with an EVENT submission.
 */
export interface OkPacket extends MessagePacketBase<"OK"> {
  eventId: string;
  ok: boolean;
  notice?: string;
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
