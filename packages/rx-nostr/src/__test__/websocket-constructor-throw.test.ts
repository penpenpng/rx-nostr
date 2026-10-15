import { describe, expect, test } from "vitest";
import { createMockRelay } from "vitest-nostr";
import { WS } from "vitest-websocket-mock";

import { makeRxNostrConfig } from "../config/index.js";
import { NostrConnection } from "../connection/connection.js";
import { RelayConnection } from "../connection/relay.js";
import { RxNostrWebSocketError } from "../error.js";
import type { ErrorPacket } from "../packet.js";

describe("WebSocket constructor failures", () => {
  test("emits an error when the constructor throws synchronously", () => {
    const connection = new NostrConnection(
      "ws://relay.example",
      makeRxNostrConfig({
        retry: { strategy: "off" },
        skipFetchNip11: true,
        websocketCtor: class {
          constructor() {
            throw new Error("WebSocket construction failed");
          }
        },
      }),
    );
    const errors: ErrorPacket[] = [];
    connection.getErrorObservable().subscribe((error) => errors.push(error));

    try {
      expect(() => connection.connectManually()).not.toThrow();
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toBeInstanceOf(RxNostrWebSocketError);
      expect(connection.connectionState).toBe("error");
    } finally {
      connection.dispose();
    }
  });

  test("keeps the socket created by a successful immediate retry", async () => {
    const url = "ws://relay.example";
    const relay = createMockRelay(url);
    const MockWebSocket = globalThis.WebSocket;
    let attempts = 0;
    const connection = new RelayConnection(
      url,
      makeRxNostrConfig({
        retry: { strategy: "immediately", maxCount: 1 },
        skipFetchNip11: true,
        websocketCtor: class extends MockWebSocket {
          constructor(url: string) {
            if (++attempts === 1) {
              throw new Error("WebSocket construction failed");
            }
            super(url);
          }
        },
      }),
    );

    try {
      expect(() => connection.connectManually()).not.toThrow();
      expect(attempts).toBe(2);
      await relay.connected;
      await connection.send(["CLOSE", "sub"]);
      await expect(relay).toReceiveCLOSE("sub");
    } finally {
      connection.dispose();
      WS.clean();
      relay.server.stop();
    }
  });
});
