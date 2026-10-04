import type * as Nostr from "nostr-typedef";
import { RelayDirectory, RxRelays, RxReq, type EventPacket } from "rx-nostr";
import { describe, expect, test } from "vitest";

import {
  createRxNostrScenario,
  expectAllSocketsCloseRequested,
  expectConnectionCount,
  expectSent,
  expectSocketCloseRequested,
  Faker,
  SubscriptionInspector,
} from "../helper/index.ts";

const relay = "wss://relay.example.com";

function event(overrides: Partial<Nostr.Event> = {}): Nostr.Event {
  return Faker.event({
    id: "event",
    pubkey: "pubkey",
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  });
}

describe("REQ public contract", () => {
  describe("backward queries", () => {
    test("sends a backward REQ, exposes traceTag, and ends on EOSE", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const rxReq = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, rxReq).subscribe(inspector);
      rxReq.emit([{ kinds: [1] }], { traceTag: "timeline" });

      const socket = server.sockets.latest;
      socket.open();

      const req = await expectSent(socket, "REQ");
      expect(req[0]).toBe("REQ");
      expect(req[2]).toEqual({ kinds: [1] });

      const res = event({ id: "result" });
      socket.message(["EVENT", req[1], res]);
      socket.message(["EOSE", req[1]]);

      await expect(inspector.waitNext()).resolves.toEqual({
        from: relay,
        type: "EVENT",
        event: res,
        traceTag: "timeline",
      });
      expect(socket.sent).toHaveLength(1);
      expect(inspector.completed).toBe(false);

      rxReq.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expectSocketCloseRequested(socket);

      socket.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("reconnect", () => {
    test("resends an active backward REQ after an abnormal disconnect", async () => {
      const { server, rxNostr } = createRxNostrScenario({
        reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);

      const first = server.sockets.latest;
      first.open();
      const firstReq = await expectSent(first, "REQ");

      first.peerClose(1006, "offline");

      await expectConnectionCount(server, 2);
      const second = server.sockets.latest;
      second.open();
      const secondReq = await expectSent(second, "REQ");

      expect(secondReq[2]).toEqual(firstReq[2]);
      second.message(["EOSE", secondReq[1]]);
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expectSocketCloseRequested(second);
      second.acknowledgeClose();
      rxNostr.dispose();
    });

    test("resends an active forward REQ after an abnormal disconnect", async () => {
      const { server, rxNostr } = createRxNostrScenario({
        reconnector: { reconnect: () => ({ action: "retry", delay: 0 }) },
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      const subscription = rxNostr.forward(relay, [{ kinds: [1] }]).subscribe(inspector);

      const first = server.sockets.latest;
      first.open();
      const firstReq = await expectSent(first, "REQ");

      first.peerClose(1006, "offline");

      await expectConnectionCount(server, 2);
      const second = server.sockets.latest;
      second.open();
      const secondReq = await expectSent(second, "REQ");

      expect(secondReq[2]).toEqual(firstReq[2]);
      second.message(["EOSE", secondReq[1]]);
      expect(inspector.completed).toBe(false);

      subscription.unsubscribe();
      await expectSocketCloseRequested(second);
      second.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("forward queries", () => {
    test("keeps the latest forward segment active after its hot source is disposed", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      const subscription = rxNostr.forward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      const socket = server.sockets.latest;
      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      request.dispose();
      socket.message(["EVENT", subId, event({ id: "after-source-completion" })]);

      await expect(inspector.waitNext()).resolves.toMatchObject({
        event: { id: "after-source-completion" },
      });
      expect(inspector.completed).toBe(false);
      expect(socket.sentOfType("CLOSE")).toEqual([]);

      subscription.unsubscribe();
      expect(await expectSent(socket, "CLOSE")).toEqual(["CLOSE", subId]);
      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("gives each static forward subscription its own active REQ", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const query = rxNostr.forward(relay, [{ kinds: [1] }]);
      const firstInspector = new SubscriptionInspector<EventPacket>();
      expect(server.connections).toEqual([]);

      const secondInspector = new SubscriptionInspector<EventPacket>();
      const firstSubscription = query.subscribe(secondInspector);
      const socket = server.sockets.latest;
      socket.open();
      const first = await expectSent(socket, "REQ");
      const secondSubscription = query.subscribe(firstInspector);
      const second = await expectSent(socket, "REQ", 2);
      expect(second[1]).not.toBe(first[1]);

      firstSubscription.unsubscribe();
      expect(await expectSent(socket, "CLOSE")).toEqual(["CLOSE", first[1]]);
      socket.message(["EVENT", second[1], event({ id: "second-subscription" })]);
      await expect(firstInspector.waitNext()).resolves.toMatchObject({
        event: { id: "second-subscription" },
      });
      expect(socket.closeRequests).toEqual([]);

      secondSubscription.unsubscribe();
      expect(await expectSent(socket, "CLOSE", 2)).toEqual(["CLOSE", second[1]]);
      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("replaces a forward REQ and sends CLOSE for each local end", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();
      const subscription = rxNostr.forward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      await expectConnectionCount(server, 1);
      const socket = server.sockets.latest;
      socket.open();
      const first = await expectSent(socket, "REQ");

      request.emit([{ kinds: [2] }]);
      const second = await expectSent(socket, "REQ", 2);
      await expectSent(socket, "CLOSE");
      expect(socket.sent).toContainEqual(["CLOSE", first[1]]);
      expect(second[2]).toEqual({ kinds: [2] });

      subscription.unsubscribe();
      await expectSent(socket, "CLOSE", 2);
      expect(socket.sent).toContainEqual(["CLOSE", second[1]]);
      await expectSocketCloseRequested(socket);

      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("keeps a fixed forward descriptor active after EOSE", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      const subscription = rxNostr.forward(relay, [{ kinds: [1] }]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      socket.message(["EOSE", subId]);
      socket.message(["EVENT", subId, event({ id: "live" })]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "live" } });
      expect(inspector.completed).toBe(false);

      subscription.unsubscribe();
      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("input and filtering", () => {
    test("completes an empty destination without creating a connection", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward([], [{}]).subscribe(inspector);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(server.connections).toEqual([]);

      rxNostr.dispose();
    });

    test.each([
      ["forward", true],
      ["forward", false],
      ["backward", true],
      ["backward", false],
    ] as const)(
      "completes an empty %s request with defer=%s without connecting",
      async (strategy, defer) => {
        const { server, rxNostr } = createRxNostrScenario();
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr[strategy](relay, [], { defer }).subscribe(inspector);

        await expect(inspector.waitComplete()).resolves.toBeUndefined();
        expect(server.connections).toEqual([]);

        rxNostr.dispose();
      },
    );

    test("applies filter matching, verification, and expiration in order", async () => {
      const verified: string[] = [];
      const { server, rxNostr } = createRxNostrScenario({
        verifier: {
          async verifyEvent(value) {
            verified.push(value.id);
            return value.id !== "invalid-signature";
          },
        },
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{ kinds: [1] }]).subscribe(inspector);
      const socket = server.sockets.latest;
      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      const expiredAt = Math.floor(Date.now() / 1000) - 1;
      for (const value of [
        event({ id: "mismatch", kind: 2 }),
        event({ id: "invalid-signature" }),
        event({ id: "expired", tags: [["expiration", `${expiredAt}`]] }),
        event({ id: "valid" }),
      ]) {
        const socket = server.sockets.latest;
        socket.message(["EVENT", subId, value]);
      }
      socket.message(["EOSE", subId]);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(verified).toEqual(["invalid-signature", "expired", "valid"]);
      await expect(inspector.waitNext().then((packet) => packet.event.id)).resolves.toEqual(
        "valid",
      );

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("wraps verifier exceptions as callback errors", async () => {
      const cause = new Error("verifier failed");
      const { server, rxNostr } = createRxNostrScenario({
        verifier: { verifyEvent: async () => Promise.reject(cause) },
      });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);
      const socket = server.sockets.latest;
      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      socket.message(["EVENT", subId, event()]);
      expect(await inspector.waitError()).toMatchObject({
        name: "RxNostrCallbackError",
        callback: "verifier",
        cause,
      });
      expect(await expectSent(socket, "CLOSE")).toEqual(["CLOSE", subId]);

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("honors filter and expiration skips", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr
        .backward(relay, [{ kinds: [1] }], {
          skipExpirationCheck: true,
          skipValidateFilterMatching: true,
        })
        .subscribe(inspector);
      const socket = server.sockets.latest;
      socket.open();
      const [, subId] = await expectSent(socket, "REQ");
      socket.message([
        "EVENT",
        subId,
        event({
          id: "skipped",
          kind: 2,
          tags: [["expiration", "0"]],
        }),
      ]);
      socket.message(["EOSE", subId]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "skipped" } });
      await expectSocketCloseRequested(socket);

      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("wraps lazy filter exceptions as callback errors", async () => {
      const { server: callbackServer, rxNostr: callbackRxNostr } = createRxNostrScenario();
      const cause = new Error("filter failed");
      const inspector = new SubscriptionInspector<EventPacket>();

      callbackRxNostr
        .backward(relay, [
          {
            since: () => {
              throw cause;
            },
          },
        ])
        .subscribe(inspector);

      const socket = callbackServer.sockets.latest;

      socket.open();
      expect(await inspector.waitError()).toMatchObject({
        name: "RxNostrCallbackError",
        callback: "filter",
        cause,
      });
      expect(socket.sent).toEqual([]);

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      callbackRxNostr.dispose();
    });
  });

  describe("multiple relays", () => {
    test("isolates one relay's retry exhaustion from another relay", async () => {
      const one = "wss://one.example.com";
      const two = "wss://two.example.com";
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward([one, two], [{}]).subscribe(inspector);

      await expectConnectionCount(server, 2);
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, secondSubId] = await expectSent(second, "REQ");
      await expectSent(first, "REQ");
      first.peerClose(1006, "offline");
      second.message(["EVENT", secondSubId, event({ id: "from-two" })]);
      second.message(["EOSE", secondSubId]);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      await expect(inspector.waitNext().then((packet) => packet.event.id)).resolves.toEqual(
        "from-two",
      );

      await expectSocketCloseRequested(second);
      second.acknowledgeClose();
      rxNostr.dispose();
    });

    test("stops a removed relay while keeping the remaining backward relay active", async () => {
      const one = "wss://one.example.com";
      const two = "wss://two.example.com";
      const destinations = new RxRelays([one, two]);
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(destinations, request).subscribe(inspector);
      request.emit([{}]);

      await expectConnectionCount(server, 2);
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, firstSubId] = await expectSent(first, "REQ");
      const [, secondSubId] = await expectSent(second, "REQ");

      destinations.remove(one);
      await expectSent(first, "CLOSE");
      expect(first.sent).toContainEqual(["CLOSE", firstSubId]);

      second.message(["EVENT", secondSubId, event({ id: "remaining" })]);
      second.message(["EOSE", secondSubId]);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "remaining" } });
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expectAllSocketsCloseRequested(server);
      for (const socket of server.connections) socket.acknowledgeClose();
      destinations.dispose();
      rxNostr.dispose();
    });

    test("ends the current segment when all backward relays are removed", async () => {
      const one = "wss://one.example.com";
      const two = "wss://two.example.com";
      const destinations = new RxRelays([one, two]);
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(destinations, request).subscribe(inspector);
      request.emit([{}]);

      await expectConnectionCount(server, 2);
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, firstSubId] = await expectSent(first, "REQ");
      const [, secondSubId] = await expectSent(second, "REQ");

      destinations.clear();
      await expectSent(first, "CLOSE");
      await expectSent(second, "CLOSE");
      expect(first.sent).toContainEqual(["CLOSE", firstSubId]);
      expect(second.sent).toContainEqual(["CLOSE", secondSubId]);
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expectAllSocketsCloseRequested(server);
      for (const socket of server.connections) socket.acknowledgeClose();
      destinations.dispose();
      rxNostr.dispose();
    });

    test("runs multiple backward emissions concurrently without a subscription limit", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      const socket = server.sockets.latest;
      socket.open();
      const first = await expectSent(socket, "REQ");
      expect(first[2]).toEqual({ kinds: [1] });

      request.emit([{ kinds: [2] }]);
      const second = await expectSent(socket, "REQ", 2);
      expect(second[2]).toEqual({ kinds: [2] });
      expect(socket.sent).not.toContainEqual(["CLOSE", first[1]]);

      socket.message(["EVENT", first[1], event({ id: "first" })]);
      socket.message(["EVENT", second[1], event({ id: "second", kind: 2 })]);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "first" } });
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "second" } });

      socket.message(["EOSE", first[1]]);
      socket.message(["EOSE", second[1]]);
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("runs up to the standard max_subscriptions limit concurrently and queues overflow", async () => {
      const directory = new RelayDirectory();
      directory.setNip11(relay, {
        limitation: { max_subscriptions: 3 },
      });
      const { server, rxNostr } = createRxNostrScenario({
        relayDirectory: directory,
      });
      const request = new RxReq();

      const inspector = new SubscriptionInspector<EventPacket>();
      rxNostr.backward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      request.emit([{ kinds: [2] }]);
      request.emit([{ kinds: [3] }]);
      request.emit([{ kinds: [4] }]);

      const socket = server.sockets.latest;

      socket.open();
      await expectSent(socket, "REQ", 3);
      const [first, second, third] = socket.sentOfType("REQ");
      expect(first[2]).toEqual({ kinds: [1] });
      expect(second[2]).toEqual({ kinds: [2] });
      expect(third[2]).toEqual({ kinds: [3] });
      expect(socket.sent).toHaveLength(3);

      socket.message(["EOSE", first[1]]);

      const fourth = await expectSent(socket, "REQ", 4);
      expect(fourth[2]).toEqual({ kinds: [4] });

      socket.message(["EOSE", second[1]]);
      socket.message(["EOSE", third[1]]);
      socket.message(["EOSE", fourth[1]]);
      request.dispose();

      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("serializes backward REQs when max_subscriptions is 1", async () => {
      const directory = new RelayDirectory();
      directory.setNip11(relay, {
        limitation: { max_subscriptions: 1 },
      });
      const { server, rxNostr } = createRxNostrScenario({
        relayDirectory: directory,
      });
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      request.emit([{ kinds: [2] }]);
      const socket = server.sockets.latest;
      socket.open();
      const first = await expectSent(socket, "REQ");
      expect(first[2]).toEqual({ kinds: [1] });
      socket.message(["EOSE", first[1]]);

      const second = await expectSent(socket, "REQ", 2);
      expect(second[2]).toEqual({ kinds: [2] });
      socket.message(["EOSE", second[1]]);

      expect(inspector.completed).toBe(false);
      rxNostr.dispose();
      await expectSocketCloseRequested(socket);
      socket.acknowledgeClose();
    });

    test("sends an unfinished backward query to a dynamically added relay", async () => {
      const one = "wss://one.example.com";
      const two = "wss://two.example.com";
      const destinations = new RxRelays([one]);
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(destinations, request).subscribe(inspector);
      request.emit([{ kinds: [1] }]);
      await expectConnectionCount(server, 1);
      const first = server.sockets.latestFor(one);
      first.open();
      const [, firstSubId] = await expectSent(first, "REQ");

      destinations.append(two);
      await expectConnectionCount(server, 2);
      const second = server.sockets.latestFor(two);
      second.open();
      const [, secondSubId] = await expectSent(second, "REQ");
      second.message(["EVENT", secondSubId, event({ id: "dynamic" })]);
      first.message(["EOSE", firstSubId]);
      second.message(["EOSE", secondSubId]);

      expect(inspector.completed).toBe(false);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "dynamic" } });

      await expectAllSocketsCloseRequested(server);

      for (const socket of server.connections) socket.acknowledgeClose();
      request.dispose();
      destinations.dispose();
      rxNostr.dispose();
    });
  });
});
