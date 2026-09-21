import * as Nostr from "nostr-typedef";
import { expect } from "vitest";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";

export class Expect {
  static eventPacket({
    from,
    traceTag,
    ...event
  }: Partial<Nostr.Event> & {
    from?: RelayUrl;
    traceTag?: string | number;
  }): EventPacket {
    return expect.objectContaining({
      from: from ? from : expect.anything(),
      ...(traceTag === undefined ? {} : { traceTag }),
      event: expect.objectContaining(event),
    });
  }
}
