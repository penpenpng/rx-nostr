import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer } from "../__test__/helper/index.ts";
import { NoopReconnector } from "../connection-reconnector/index.ts";
import type { RxNostrDiagnostic } from "../diagnostics/index.ts";
import { NoopVerifier } from "../event-verifier/index.ts";
import { RxNostr } from "./rx-nostr.ts";

const relay = "wss://diagnostics.example.com";

describe("RxNostr diagnostics", () => {
  test("combines transport diagnostics and connection errors from every client", async () => {
    const server = new ControlledWebSocketServer();
    const anotherServer = new ControlledWebSocketServer();
    const anotherRelay = "wss://another-diagnostics.example.com";
    const diagnostics: RxNostrDiagnostic[] = [];
    const mutated: RxNostrDiagnostic[] = [];
    const mutatingSubscription = RxNostr.diagnostics.subscribe((diagnostic) => {
      diagnostic.message = "mutated by another subscriber";
      mutated.push(diagnostic);
    });
    const subscription = RxNostr.diagnostics.subscribe((diagnostic) =>
      diagnostics.push(diagnostic),
    );
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
    server.sockets.latest.open();
    anotherServer.sockets.latest.open();
    server.sockets.latest.rawMessage("not-json");
    anotherServer.sockets.latest.rawMessage("not-json");
    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          relay,
          occurredAt: expect.any(Number),
          message: "A message received from the relay could not be decoded and was ignored.",
          cause: expect.any(Error),
          details: { inputKind: "text", inputSize: 8 },
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          relay: anotherRelay,
          message: "A message received from the relay could not be decoded and was ignored.",
        }),
      ),
    );

    server.sockets.latest.peerClose(1006, "network lost");
    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          relay,
          message: "The relay connection dropped unexpectedly.",
          details: {
            source: "peer-close",
            closeCode: 1006,
            closeReason: "network lost",
            wasClean: false,
          },
        }),
      ),
    );

    expect(mutated).toHaveLength(diagnostics.length);
    expect(diagnostics.every((diagnostic) => !("type" in diagnostic))).toBe(true);
    expect(
      diagnostics.every((diagnostic) => diagnostic.message !== "mutated by another subscriber"),
    ).toBe(true);

    rxNostr.dispose();
    anotherRxNostr.dispose();
    anotherServer.sockets.latest.acknowledgeClose();
    subscription.unsubscribe();
    mutatingSubscription.unsubscribe();
  });

  test("includes failed initial WebSocket attempts previously exposed as v3 errors", async () => {
    const server = new ControlledWebSocketServer();
    const diagnostics: RxNostrDiagnostic[] = [];
    const subscription = RxNostr.diagnostics.subscribe((diagnostic) =>
      diagnostics.push(diagnostic),
    );
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
          relay,
          message: "A relay connection attempt failed.",
          details: expect.objectContaining({
            source: "peer-close",
            closeCode: 1006,
            closeReason: "unreachable",
          }),
        }),
      ),
    );

    rxNostr.dispose();
    subscription.unsubscribe();
  });

  test("includes WebSocket send failures previously exposed as v3 errors", async () => {
    const server = new ControlledWebSocketServer();
    const cause = new Error("send failed");
    const diagnostics: RxNostrDiagnostic[] = [];
    const subscription = RxNostr.diagnostics.subscribe((diagnostic) =>
      diagnostics.push(diagnostic),
    );
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
    rxNostr.req(relay, { strategy: "oneshot", filters: {} }).subscribe();

    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "error",
          relay,
          message: "A relay operation failed unexpectedly.",
          cause,
          details: { reason: "fatal-error" },
        }),
      ),
    );

    rxNostr.dispose();
    server.sockets.latest.acknowledgeClose();
    subscription.unsubscribe();
  });

  test("includes rx-nostr diagnostics", async () => {
    const diagnostics: RxNostrDiagnostic[] = [];
    const subscription = RxNostr.diagnostics.subscribe((diagnostic) =>
      diagnostics.push(diagnostic),
    );
    const rxNostr = new RxNostr({
      verifier: new NoopVerifier(),
      skipFetchNip11: true,
    });

    rxNostr.req([], { strategy: "oneshot", filters: {} }).subscribe();

    await vi.waitFor(() =>
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          occurredAt: expect.any(Number),
          message: "A REQ was issued without any destination relays.",
        }),
      ),
    );

    rxNostr.dispose();
    subscription.unsubscribe();
  });
});
