import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer } from "../__test__/helper/index.ts";
import { NoopRetryer } from "../connection-retryer/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import type { ConnectionStatePacket } from "../packets/index.ts";
import { RxNostr } from "./rx-nostr.ts";

describe("RxNostr connection state", () => {
  test("observes created relays without creating monitor-only pool entries", async () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://one.example.com";
    const secondRelay = "wss://two.example.com";
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      retry: new NoopRetryer(),
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
