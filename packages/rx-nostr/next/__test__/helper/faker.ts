import * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";

export class Faker {
  static event(event: Partial<Nostr.Event>): Nostr.Event {
    return {
      id: "",
      pubkey: "",
      created_at: 0,
      kind: 0,
      tags: [],
      content: "",
      sig: "",
      ...event,
    };
  }

  static eventPacket({
    from,
    ...event
  }: Partial<Nostr.Event> & { from?: RelayUrl }): EventPacket {
    return {
      from: from ?? "wss://faker.example.com",
      type: "EVENT",
      event: Faker.event(event),
      message: ["EVENT", "sub-id", Faker.event(event)],
    };
  }
}
