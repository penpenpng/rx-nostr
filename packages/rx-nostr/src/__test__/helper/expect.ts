import * as Nostr from "nostr-typedef";
import { expect, vi } from "vitest";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";
import type { ControlledWebSocket } from "../support/controlled-websocket.ts";

export async function expectSent<T extends Nostr.ToRelayMessage.Type>(
  socket: ControlledWebSocket,
  type: T,
  count = 1,
): Promise<Nostr.ToRelayMessage.Message<T>> {
  await vi.waitFor(() => expect(socket.sentOfType(type)).toHaveLength(count));
  return socket.latestSent(type);
}

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
