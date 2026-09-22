import { describe, expect, test } from "vitest";
import { ControlledWebSocketServer } from "./controlled-websocket.ts";

describe("ControlledWebSocketServer", () => {
  test("distinguishes the latest connection overall from the latest connection for a relay", () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://one.example.com";
    const secondRelay = "wss://two.example.com";

    new server.WebSocket(firstRelay);
    const first = server.latestConnection;
    new server.WebSocket(secondRelay);
    const second = server.latestConnection;
    new server.WebSocket(firstRelay);
    const reconnectedFirst = server.latestConnection;

    expect(server.connections).toEqual([first, second, reconnectedFirst]);
    expect(server.latestConnection).toBe(reconnectedFirst);
    expect(server.latestConnectionFor(firstRelay)).toBe(reconnectedFirst);
    expect(server.latestConnectionFor(secondRelay)).toBe(second);
  });

  test("rejects access when no matching connection exists", () => {
    const server = new ControlledWebSocketServer();

    expect(() => server.latestConnection).toThrow("No controlled connection has been created.");
    expect(() => server.latestConnectionFor("wss://missing.example.com")).toThrow(
      "No controlled connection has been created for wss://missing.example.com.",
    );
  });
});
