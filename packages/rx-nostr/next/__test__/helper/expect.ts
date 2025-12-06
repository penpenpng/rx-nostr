import * as Nostr from "nostr-typedef";
import { expect } from "vitest";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";

export class Expect {
  static eventPacket({
    from,
    ...event
  }: Partial<Nostr.Event> & { from?: RelayUrl }): EventPacket {
    return expect.objectContaining({
      from: from ? from : expect.anything(),
      event: expect.objectContaining(event),
    });
  }
}
