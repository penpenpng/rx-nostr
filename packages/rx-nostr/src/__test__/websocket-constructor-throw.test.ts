import { describe, expect, test } from "vitest";

import { makeRxNostrConfig } from "../config/index.js";
import { NostrConnection } from "../connection/connection.js";
import { RxNostrWebSocketError } from "../error.js";

describe("WebSocket constructor failures", () => {
  test("reports a synchronous constructor exception without throwing", () => {
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
    const errors: unknown[] = [];
    connection.getErrorObservable().subscribe((error) => errors.push(error));

    try {
      expect(() => connection.connectManually()).not.toThrow();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(RxNostrWebSocketError);
    } finally {
      connection.dispose();
    }
  });
});
