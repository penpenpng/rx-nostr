import {
  NoopReconnector,
  NoopVerifier,
  RxNostr,
  type ConnectionDropDetectorContext,
  type ConnectionStatePacket,
} from "rx-nostr";
import { map, tap } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer } from "../helper/index.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

describe("connection state public contract", () => {
  test("passes configured drop detectors to each relay connection", async () => {
    const server = new ControlledWebSocketServer();
    const relay = "wss://detected.example.com";
    const contexts: ConnectionDropDetectorContext[] = [];
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
      dropDetectors: [{ setup: (context) => void contexts.push(context) }],
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<string>();
    rxNostr
      .monitorConnectionState()
      .pipe(map((packet) => packet.state.state))
      .subscribe(inspector);

    rxNostr.setHotRelays(relay);
    const socket = server.sockets.latest;
    socket.open();
    await inspector.ignoreNexts(2);
    await expect(inspector.waitNext()).resolves.toBe("connected");
    expect(contexts).toHaveLength(1);
    contexts[0]!.drop();
    await expect(server.connections.wait(1)).resolves.toBeDefined();
    const socket2 = server.sockets.latest;
    socket2.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(2));

    await expect(inspector.waitNext()).resolves.toBe("waiting-for-connection");
    await expect(inspector.waitNext()).resolves.toBe("retrying");
    await expect(inspector.waitNext()).resolves.toBe("connected");
    rxNostr.dispose();
    socket2.acknowledgeClose();
  });

  test("observes created relays without creating monitor-only collection entries", async () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://one.example.com";
    const secondRelay = "wss://two.example.com";
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const inspector = new SubscriptionInspector<ConnectionStatePacket>();
    const states = rxNostr.monitorConnectionState();
    const mutatingInspector = new SubscriptionInspector<ConnectionStatePacket>();
    states
      .pipe(
        tap((packet) => {
          if (packet.state.state === "connecting") packet.state.attempt = 100;
        }),
      )
      .subscribe(mutatingInspector);
    states.subscribe(inspector);

    expect(server.connections).toHaveLength(0);
    rxNostr.setHotRelays([firstRelay, secondRelay]);
    expect(server.connections).toHaveLength(2);
    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://one.example.com",
      state: { state: "dormant" },
    });
    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://one.example.com",
      state: { state: "connecting", attempt: 1 },
    });
    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://two.example.com",
      state: { state: "dormant" },
    });
    await expect(inspector.waitNext()).resolves.toEqual({
      from: "wss://two.example.com",
      state: { state: "connecting", attempt: 1 },
    });

    const first = server.sockets.latestFor(firstRelay);
    const second = server.sockets.latestFor(secondRelay);
    first.open();
    second.open();
    await expect(inspector.waitNext()).resolves.toMatchObject({
      from: firstRelay,
      state: { state: "connected" },
    });
    await expect(inspector.waitNext()).resolves.toMatchObject({
      from: secondRelay,
      state: { state: "connected" },
    });

    first.peerClose(1006, "one failed");
    await expect(inspector.waitNext()).resolves.toMatchObject({
      from: firstRelay,
      state: { state: "failed" },
    });
    expect(inspector.length).toBe(7);

    rxNostr.unsetHotRelays();
    await expect(second.closeRequested).resolves.toBeDefined();
    second.acknowledgeClose();
    rxNostr.dispose();
  });
});
