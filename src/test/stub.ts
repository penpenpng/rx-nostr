import { Nostr } from "../nostr/primitive.js";
import { EventPacket } from "../packet.js";

export function fakeEvent(event?: Partial<Nostr.Event>): Nostr.Event {
  return {
    id: "*",
    content: "*",
    created_at: new Date("2000/1/1").getTime() / 1000,
    kind: 0,
    pubkey: "*",
    sig: "*",
    tags: [],
    ...event,
  };
}

export function fakeEventPacket(
  packet?: Partial<Omit<EventPacket, "event">> & {
    event?: Partial<EventPacket["event"]>;
  }
): EventPacket {
  return {
    from: packet?.from ?? "*",
    subId: packet?.subId ?? "*",
    event: fakeEvent(packet?.event),
  };
}

export function fakeEventMessage(message?: {
  subId?: string;
  event?: Partial<EventPacket["event"]>;
}): Nostr.IncomingMessage.EVENT {
  return ["EVENT", message?.subId ?? "*", fakeEvent(message?.event)];
}
