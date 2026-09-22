import { describe, expect, test } from "vitest";
import { ControlledWebSocketServer } from "./controlled-websocket.ts";

describe("ControlledWebSocketServer", () => {
  test("distinguishes the latest connection overall from the latest connection for a relay", () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://one.example.com";
    const secondRelay = "wss://two.example.com";

    new server.WebSocket(firstRelay);
    const first = server.sockets.latest;
    new server.WebSocket(secondRelay);
    const second = server.sockets.latest;
    new server.WebSocket(firstRelay);
    const reconnectedFirst = server.sockets.latest;

    expect(server.connections).toEqual([first, second, reconnectedFirst]);
    expect(server.sockets.latest).toBe(reconnectedFirst);
    expect(server.sockets.latestFor(firstRelay)).toBe(reconnectedFirst);
    expect(server.sockets.latestFor(secondRelay)).toBe(second);
  });

  test("rejects access when no matching connection exists", () => {
    const server = new ControlledWebSocketServer();

    expect(() => server.sockets.latest).toThrow("No controlled connection has been created.");
    expect(() => server.sockets.latestFor("wss://missing.example.com")).toThrow(
      "No controlled connection has been created for wss://missing.example.com.",
    );
  });
});
