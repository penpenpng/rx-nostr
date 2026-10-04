import { filter, firstValueFrom } from "rxjs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer } from "../__test__/helper/index.ts";
import { SubscriptionInspector } from "../__test__/helper/subscription-inspector.ts";
import { NoopReconnector } from "../connection-reconnector/index.ts";
import type { RxNostrDiagnostic } from "../diagnostics/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import type { EventPacket } from "../packets/packets.interface.ts";
import { RxNostr } from "./rx-nostr.ts";

const relay = "wss://diagnostics.example.com";

describe("RxNostr diagnostics", () => {
  afterEach(() => {
    RxNostr.logSink = undefined;
  });

  test("synchronously combines logs from every client", async () => {
    const server = new ControlledWebSocketServer();
    const anotherServer = new ControlledWebSocketServer();
    const anotherRelay = "wss://another-diagnostics.example.com";
    const diagnostics: RxNostrDiagnostic[] = [];
    RxNostr.logSink = (diagnostic) => diagnostics.push(diagnostic);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });
    const anotherRxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: anotherServer.WebSocket,
    });

    rxNostr.setHotRelays(relay);
    anotherRxNostr.setHotRelays(anotherRelay);
    const connected = Promise.all([
      firstValueFrom(
        rxNostr.monitorConnectionState().pipe(filter(({ state }) => state.state === "connected")),
      ),
      firstValueFrom(
        anotherRxNostr
          .monitorConnectionState()
          .pipe(filter(({ state }) => state.state === "connected")),
      ),
    ]);
    const socket = server.sockets.latest;
    socket.open();
    const socket2 = anotherServer.sockets.latest;
    socket2.open();
    await connected;
    socket.rawMessage("not-json");
    socket2.rawMessage("not-json");
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        level: "warning",
        event: "message/deserialization",
        message: expect.any(String),
        cause: expect.any(Error),
        context: expect.objectContaining({ relay, input: { kind: "text", size: 8 } }),
      }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        event: "message/deserialization",
        context: expect.objectContaining({ relay: anotherRelay }),
      }),
    );

    socket.peerClose(1006, "network lost");
    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          event: "connection/dropped",
          context: {
            relay,
            dropSource: "peer-close",
            closeCode: 1006,
            closeReason: "network lost",
            wasClean: false,
            detectedAt: expect.any(Number),
          },
        }),
      ),
    );

    expect(diagnostics.every((diagnostic) => Object.isFrozen(diagnostic))).toBe(true);
    expect(diagnostics.every((diagnostic) => Object.isFrozen(diagnostic.context))).toBe(true);
    expect(diagnostics.every((diagnostic) => !("type" in diagnostic))).toBe(true);
    rxNostr.dispose();
    anotherRxNostr.dispose();
    socket2.acknowledgeClose();
  });

  test("reports failed initial WebSocket attempts", async () => {
    const server = new ControlledWebSocketServer();
    const diagnostics: RxNostrDiagnostic[] = [];
    RxNostr.logSink = (diagnostic) => diagnostics.push(diagnostic);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    rxNostr.setHotRelays(relay);
    const socket = server.sockets.latest;
    socket.peerClose(1006, "unreachable");

    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          event: "connection/attempt-failed",
          message: "A relay connection attempt failed.",
          context: expect.objectContaining({
            relay,
            dropSource: "peer-close",
            closeCode: 1006,
            closeReason: "unreachable",
          }),
        }),
      ),
    );

    rxNostr.dispose();
  });

  test("reports WebSocket send failures", async () => {
    const server = new ControlledWebSocketServer();
    const cause = new Error("send failed");
    const diagnostics: RxNostrDiagnostic[] = [];
    RxNostr.logSink = (diagnostic) => diagnostics.push(diagnostic);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      reconnector: new NoopReconnector(),
      skipFetchNip11: true,
      WebSocket: server.WebSocket,
    });

    rxNostr.setHotRelays(relay);
    const socket = server.sockets.latest;
    socket.open();
    socket.send = () => {
      throw cause;
    };
    const inspector = new SubscriptionInspector<EventPacket>();
    rxNostr.backward(relay, [{}]).subscribe(inspector);

    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          level: "error",
          event: "operation/stream-failed",
          message: "A relay operation failed unexpectedly.",
          cause,
          context: { relay, reason: "fatal-error" },
        }),
      ),
    );

    rxNostr.dispose();
    socket.acknowledgeClose();
  });

  test("includes rx-nostr diagnostics", async () => {
    const diagnostics: RxNostrDiagnostic[] = [];
    RxNostr.logSink = (diagnostic) => diagnostics.push(diagnostic);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
    });

    const inspector = new SubscriptionInspector<EventPacket>();
    rxNostr.backward([], [{}]).subscribe(inspector);

    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          level: "warning",
          event: "req/no-destination-relays",
          message: "A REQ was issued without any destination relays.",
          context: { operation: "backward" },
        }),
      ),
    );

    rxNostr.dispose();
  });
});
