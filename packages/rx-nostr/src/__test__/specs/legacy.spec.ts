import { NoopReconnector, NoopVerifier, RxReq } from "rx-nostr";
import { describe, expect, test } from "vitest";

import { createLegacyRxNostr } from "../../legacy.ts";
import type { EventPacket } from "../../packets/packets.interface.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

describe("createLegacyRxNostr", () => {
  test("routes v3 use() through readable default relays", async () => {
    const server = new ControlledWebSocketServer();
    const client = createLegacyRxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const readableRelay = "wss://read.example.com";
    const writeOnlyRelay = "wss://write.example.com";
    client.setDefaultRelays([
      { url: readableRelay, read: true, write: false },
      { url: writeOnlyRelay, read: false, write: true },
    ]);

    expect([...client.defaultRelays]).toEqual([readableRelay, writeOnlyRelay]);

    const request = new RxReq();
    const inspector = new SubscriptionInspector<EventPacket>();
    const subscription = client.use(request).subscribe(inspector);
    request.emit([{}]);

    const socket = server.sockets.latestFor(readableRelay);
    socket.open();
    await expect(socket.inbox.waitNext()).resolves.toHaveProperty("0", "REQ");
    expect([...server.connections].map(({ url }) => url)).toContain(readableRelay);
    expect([...server.connections].map(({ url }) => url)).not.toContain(writeOnlyRelay);

    subscription.unsubscribe();
    client.dispose();
    request.dispose();
    for (const connection of server.connections) connection.acknowledgeClose();
  });
});
