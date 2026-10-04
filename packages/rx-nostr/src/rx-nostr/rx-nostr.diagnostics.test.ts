import { afterEach, describe, expect, test, vi } from "vitest";
import { filter, firstValueFrom } from "rxjs";
import { ControlledWebSocketServer } from "../__test__/helper/index.ts";
import { NoopReconnector } from "../connection-reconnector/index.ts";
import type { RxNostrDiagnostic } from "../diagnostics/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
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
    server.sockets.latest.open();
    anotherServer.sockets.latest.open();
    await connected;
    server.sockets.latest.rawMessage("not-json");
    anotherServer.sockets.latest.rawMessage("not-json");
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

    server.sockets.latest.peerClose(1006, "network lost");
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
    anotherServer.sockets.latest.acknowledgeClose();
  });

  test("includes failed initial WebSocket attempts previously exposed as v3 errors", async () => {
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
    server.sockets.latest.peerClose(1006, "unreachable");

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

  test("includes WebSocket send failures previously exposed as v3 errors", async () => {
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
    server.sockets.latest.open();
    server.sockets.latest.send = () => {
      throw cause;
    };
    rxNostr.backward(relay, [{}]).subscribe();

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
    server.sockets.latest.acknowledgeClose();
  });

  test("includes rx-nostr diagnostics", async () => {
    const diagnostics: RxNostrDiagnostic[] = [];
    RxNostr.logSink = (diagnostic) => diagnostics.push(diagnostic);
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
    });

    rxNostr.backward([], [{}]).subscribe();

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
