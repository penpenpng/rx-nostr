import * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";

export class Faker {
  static event<K extends number = number>(event: Partial<Nostr.Event<K>> = {}): Nostr.Event<K> {
    return {
      id: "",
      pubkey: "",
      created_at: 0,
      kind: 0 as K,
      tags: [],
      content: "",
      sig: "",
      ...event,
    };
  }

  static authEvent({
    relay = "wss://faker.example.com",
    challenge = "",
    ...event
  }: Partial<Nostr.Event<22242>> & {
    relay?: string;
    challenge?: string;
  } = {}): Nostr.Event<22242> {
    return Faker.event<22242>({
      kind: 22242,
      ...event,
      tags: event.tags ?? [
        ["relay", relay],
        ["challenge", challenge],
      ],
    });
  }

  static eventPacket({
    from,
    traceTag,
    ...event
  }: Partial<Nostr.Event> & {
    from?: RelayUrl;
    traceTag?: string | number;
  }): EventPacket {
    return {
      from: from ?? "wss://faker.example.com",
      type: "EVENT",
      event: Faker.event(event),
      ...(traceTag === undefined ? {} : { traceTag }),
    };
  }
}
