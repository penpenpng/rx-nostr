import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer } from "../__test__/helper/index.ts";
import type { ConnectionDropDetectorContext } from "../connection-drop-detector/index.ts";
import { NoopReconnector } from "../connection-reconnector/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import type { ConnectionStatePacket } from "../packets/index.ts";
import { RxNostr } from "./rx-nostr.ts";

describe("RxNostr connection state", () => {
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
    const states: string[] = [];
    rxNostr.monitorConnectionState().subscribe((packet) => states.push(packet.state.state));

    rxNostr.setHotRelays(relay);
    server.sockets.latest.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    contexts[0]!.drop();
    await vi.waitFor(() => expect(server.connections).toHaveLength(2));
    server.sockets.latest.open();
    await vi.waitFor(() => expect(contexts).toHaveLength(2));

    expect(states.filter((state) => state === "connected")).toHaveLength(2);
    rxNostr.dispose();
    server.sockets.latest.acknowledgeClose();
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
    const packets: ConnectionStatePacket[] = [];
    const states = rxNostr.monitorConnectionState();
    states.subscribe((packet) => {
      if (packet.state.state === "connecting") packet.state.attempt = 100;
    });
    states.subscribe((packet) => packets.push(packet));

    expect(server.connections).toHaveLength(0);
    rxNostr.setHotRelays([firstRelay, secondRelay]);
    expect(server.connections).toHaveLength(2);
    expect(packets).toEqual([
      { from: "wss://one.example.com", state: { state: "dormant" } },
      {
        from: "wss://one.example.com",
        state: { state: "connecting", attempt: 1 },
      },
      { from: "wss://two.example.com", state: { state: "dormant" } },
      {
        from: "wss://two.example.com",
        state: { state: "connecting", attempt: 1 },
      },
    ]);

    const first = server.sockets.latestFor(firstRelay);
    const second = server.sockets.latestFor(secondRelay);
    first.open();
    second.open();
    await vi.waitFor(() =>
      expect(packets.filter((packet) => packet.state.state === "connected")).toHaveLength(2),
    );

    first.peerClose(1006, "one failed");
    await vi.waitFor(() =>
      expect(
        packets.find(
          (packet) => packet.from === "wss://one.example.com" && packet.state.state === "failed",
        ),
      ).toBeDefined(),
    );
    expect(
      packets.filter(
        (packet) => packet.from === "wss://two.example.com" && packet.state.state === "failed",
      ),
    ).toHaveLength(0);

    rxNostr.unsetHotRelays();
    await vi.waitFor(() => expect(second.closeRequests).toHaveLength(1));
    second.acknowledgeClose();
    rxNostr.dispose();
  });
});
