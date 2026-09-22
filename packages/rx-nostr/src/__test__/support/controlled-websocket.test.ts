import type * as Nostr from "nostr-typedef";
import { describe, expect, expectTypeOf, test } from "vitest";
import { expectSent } from "../helper/expect.ts";
import { ControlledWebSocket, ControlledWebSocketServer } from "./controlled-websocket.ts";

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

  test("exposes Nostr tuples instead of transport encoding", async () => {
    const socket = new ControlledWebSocket("wss://relay.example.com");
    expectTypeOf(socket.sent).toEqualTypeOf<Nostr.ToRelayMessage.Any[]>();
    expectTypeOf(socket.message).parameter(0).toEqualTypeOf<Nostr.ToClientMessage.Any>();
    const received: unknown[] = [];
    socket.onmessage = ({ data }) => received.push(data);
    socket.open();

    socket.send(JSON.stringify(["REQ", "subscription", {}]));
    socket.message(["EOSE", "subscription"]);

    await expect(expectSent(socket, "REQ")).resolves.toEqual(["REQ", "subscription", {}]);
    expect(socket.sent).toEqual([["REQ", "subscription", {}]]);
    expect(socket.sentOfType("REQ")).toEqual([["REQ", "subscription", {}]]);
    expect(socket.latestSent("REQ")).toEqual(["REQ", "subscription", {}]);
    expect(received).toEqual([JSON.stringify(["EOSE", "subscription"])]);
  });
});
