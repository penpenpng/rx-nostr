import type * as Nostr from "nostr-typedef";
import { describe, expect, expectTypeOf, test } from "vitest";

import { ControlledWebSocket, ControlledWebSocketServer } from "./controlled-websocket.ts";

describe("ControlledWebSocketServer", () => {
  test("distinguishes the latest connection overall from the latest connection for a relay", async () => {
    const server = new ControlledWebSocketServer();
    const firstRelay = "wss://one.example.com";
    const secondRelay = "wss://two.example.com";

    new server.WebSocket(firstRelay);
    const first = server.sockets.latest;
    new server.WebSocket(secondRelay);
    const second = server.sockets.latest;
    new server.WebSocket(firstRelay);
    const reconnectedFirst = server.sockets.latest;

    await expect(server.connections.waitNext()).resolves.toBe(first);
    await expect(server.connections.waitNext()).resolves.toBe(second);
    await expect(server.connections.waitNext()).resolves.toBe(reconnectedFirst);
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
    expectTypeOf(socket.inbox.waitNext).returns.toMatchTypeOf<Promise<Nostr.ToRelayMessage.Any>>();
    expectTypeOf(socket.message).parameter(0).toEqualTypeOf<Nostr.ToClientMessage.Any>();
    const received: unknown[] = [];
    socket.onmessage = ({ data }) => received.push(data);
    socket.open();

    socket.send(JSON.stringify(["REQ", "subscription", {}]));
    socket.message(["EOSE", "subscription"]);

    await expect(socket.inbox.waitNext("REQ")).resolves.toEqual(["REQ", "subscription", {}]);
    expect(socket.inbox.length).toBe(1);
    expect(received).toEqual([JSON.stringify(["EOSE", "subscription"])]);
  });

  test("rejects an unexpected next message instead of skipping it", async () => {
    const socket = new ControlledWebSocket("wss://relay.example.com");
    socket.open();
    socket.send(JSON.stringify(["AUTH", { id: "auth" }]));
    socket.send(JSON.stringify(["REQ", "subscription", {}]));

    await expect(socket.inbox.waitNext("REQ")).rejects.toThrow(
      'expected REQ as the next message, received ["AUTH",{"id":"auth"}]',
    );
    await expect(socket.inbox.waitNext("REQ")).resolves.toEqual(["REQ", "subscription", {}]);
  });

  test("allows waiting before and after the first close request", async () => {
    const socket = new ControlledWebSocket("wss://relay.example.com");
    const requested = socket.closeRequested;
    expect(socket.isCloseRequested).toBe(false);
    socket.open();
    socket.close(1000, "done");

    await expect(requested).resolves.toEqual({ code: 1000, reason: "done" });
    expect(socket.isCloseRequested).toBe(true);
    expect(socket.readyState).toBe(2);
    await expect(socket.closeRequested).resolves.toEqual({ code: 1000, reason: "done" });
    socket.acknowledgeClose();
    expect(socket.readyState).toBe(3);
  });
});
