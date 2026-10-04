import type * as Nostr from "nostr-typedef";
import { RelayDirectory, RxRelays, RxReq, type EventPacket } from "rx-nostr";
import { describe, expect, test } from "vitest";

import { createRxNostrScenario, Faker, SubscriptionInspector } from "../helper/index.ts";

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

      const req = await socket.inbox.waitNext("REQ");
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
      expect(socket.inbox.length).toBe(1);
      expect(inspector.completed).toBe(false);

      rxReq.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expect(socket.closeRequested).resolves.toBeDefined();

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
      const firstReq = await first.inbox.waitNext("REQ");

      first.peerClose(1006, "offline");

      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const second = server.sockets.latest;
      second.open();
      const secondReq = await second.inbox.waitNext("REQ");

      expect(secondReq[2]).toEqual(firstReq[2]);
      second.message(["EOSE", secondReq[1]]);
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expect(second.closeRequested).resolves.toBeDefined();
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
      const firstReq = await first.inbox.waitNext("REQ");

      first.peerClose(1006, "offline");

      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const second = server.sockets.latest;
      second.open();
      const secondReq = await second.inbox.waitNext("REQ");

      expect(secondReq[2]).toEqual(firstReq[2]);
      second.message(["EOSE", secondReq[1]]);
      expect(inspector.completed).toBe(false);

      subscription.unsubscribe();
      await expect(second.closeRequested).resolves.toBeDefined();
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
      const [, subId] = await socket.inbox.waitNext("REQ");
      request.dispose();
      socket.message(["EVENT", subId, event({ id: "after-source-completion" })]);

      await expect(inspector.waitNext()).resolves.toMatchObject({
        event: { id: "after-source-completion" },
      });
      expect(inspector.completed).toBe(false);
      expect(socket.inbox.length).toBe(1);

      subscription.unsubscribe();
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", subId]);
      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("gives each static forward subscription its own active REQ", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const query = rxNostr.forward(relay, [{ kinds: [1] }]);
      const firstInspector = new SubscriptionInspector<EventPacket>();
      expect(server.connections.length).toBe(0);

      const secondInspector = new SubscriptionInspector<EventPacket>();
      const firstSubscription = query.subscribe(secondInspector);
      const socket = server.sockets.latest;
      socket.open();
      const first = await socket.inbox.waitNext("REQ");
      const secondSubscription = query.subscribe(firstInspector);
      const second = await socket.inbox.waitNext("REQ");
      expect(second[1]).not.toBe(first[1]);

      firstSubscription.unsubscribe();
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", first[1]]);
      socket.message(["EVENT", second[1], event({ id: "second-subscription" })]);
      await expect(firstInspector.waitNext()).resolves.toMatchObject({
        event: { id: "second-subscription" },
      });
      expect(socket.isCloseRequested).toBe(false);

      secondSubscription.unsubscribe();
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", second[1]]);
      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("replaces a forward REQ and sends CLOSE for each local end", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const request = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();
      const subscription = rxNostr.forward(relay, request).subscribe(inspector);

      request.emit([{ kinds: [1] }]);
      await expect(server.connections.wait(0)).resolves.toBeDefined();
      const socket = server.sockets.latest;
      socket.open();
      const first = await socket.inbox.waitNext("REQ");

      request.emit([{ kinds: [2] }]);
      await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", first[1]]);
      const second = await socket.inbox.waitNext("REQ");
      expect(second[2]).toEqual({ kinds: [2] });

      subscription.unsubscribe();
      await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", second[1]]);
      await expect(socket.closeRequested).resolves.toBeDefined();

      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test("keeps a fixed forward descriptor active after EOSE", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      const subscription = rxNostr.forward(relay, [{ kinds: [1] }]).subscribe(inspector);

      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");
      socket.message(["EOSE", subId]);
      socket.message(["EVENT", subId, event({ id: "live" })]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "live" } });
      expect(inspector.completed).toBe(false);

      subscription.unsubscribe();
      await expect(socket.closeRequested).resolves.toBeDefined();
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
      expect(server.connections.length).toBe(0);

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
        expect(server.connections.length).toBe(0);

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
      const [, subId] = await socket.inbox.waitNext("REQ");
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

      await expect(socket.closeRequested).resolves.toBeDefined();
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
      const [, subId] = await socket.inbox.waitNext("REQ");
      socket.message(["EVENT", subId, event()]);
      expect(await inspector.waitError()).toMatchObject({
        name: "RxNostrCallbackError",
        callback: "verifier",
        cause,
      });
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", subId]);

      await expect(socket.closeRequested).resolves.toBeDefined();
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
      const [, subId] = await socket.inbox.waitNext("REQ");
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
      await expect(socket.closeRequested).resolves.toBeDefined();

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
      expect(socket.inbox.length).toBe(0);

      await expect(socket.closeRequested).resolves.toBeDefined();
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

      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, secondSubId] = await second.inbox.waitNext("REQ");
      await expect(first.inbox.waitNext()).resolves.toHaveProperty("0", "REQ");
      first.peerClose(1006, "offline");
      second.message(["EVENT", secondSubId, event({ id: "from-two" })]);
      second.message(["EOSE", secondSubId]);

      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      await expect(inspector.waitNext().then((packet) => packet.event.id)).resolves.toEqual(
        "from-two",
      );

      await expect(second.closeRequested).resolves.toBeDefined();
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

      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, firstSubId] = await first.inbox.waitNext("REQ");
      const [, secondSubId] = await second.inbox.waitNext("REQ");

      destinations.remove(one);
      await expect(first.inbox.waitNext()).resolves.toEqual(["CLOSE", firstSubId]);

      second.message(["EVENT", secondSubId, event({ id: "remaining" })]);
      second.message(["EOSE", secondSubId]);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "remaining" } });
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await Promise.all(
        [...server.connections].map((socket) =>
          expect(socket.closeRequested).resolves.toBeDefined(),
        ),
      );
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

      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const first = server.sockets.latestFor(one);
      const second = server.sockets.latestFor(two);
      first.open();
      second.open();
      const [, firstSubId] = await first.inbox.waitNext("REQ");
      const [, secondSubId] = await second.inbox.waitNext("REQ");

      destinations.clear();
      await expect(first.inbox.waitNext()).resolves.toEqual(["CLOSE", firstSubId]);
      await expect(second.inbox.waitNext()).resolves.toEqual(["CLOSE", secondSubId]);
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await Promise.all(
        [...server.connections].map((socket) =>
          expect(socket.closeRequested).resolves.toBeDefined(),
        ),
      );
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
      const first = await socket.inbox.waitNext("REQ");
      expect(first[2]).toEqual({ kinds: [1] });

      request.emit([{ kinds: [2] }]);
      const second = await socket.inbox.waitNext("REQ");
      expect(second[2]).toEqual({ kinds: [2] });
      expect(socket.inbox.length).toBe(2);

      socket.message(["EVENT", first[1], event({ id: "first" })]);
      socket.message(["EVENT", second[1], event({ id: "second", kind: 2 })]);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "first" } });
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "second" } });

      socket.message(["EOSE", first[1]]);
      socket.message(["EOSE", second[1]]);
      expect(inspector.completed).toBe(false);

      request.dispose();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();

      await expect(socket.closeRequested).resolves.toBeDefined();
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
      const first = await socket.inbox.waitNext("REQ");
      const second = await socket.inbox.waitNext("REQ");
      const third = await socket.inbox.waitNext("REQ");
      expect(first[2]).toEqual({ kinds: [1] });
      expect(second[2]).toEqual({ kinds: [2] });
      expect(third[2]).toEqual({ kinds: [3] });
      expect(socket.inbox.length).toBe(3);

      socket.message(["EOSE", first[1]]);

      const fourth = await socket.inbox.waitNext("REQ");
      expect(fourth[2]).toEqual({ kinds: [4] });

      socket.message(["EOSE", second[1]]);
      socket.message(["EOSE", third[1]]);
      socket.message(["EOSE", fourth[1]]);
      request.dispose();

      await expect(socket.closeRequested).resolves.toBeDefined();
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
      const first = await socket.inbox.waitNext("REQ");
      expect(first[2]).toEqual({ kinds: [1] });
      socket.message(["EOSE", first[1]]);

      const second = await socket.inbox.waitNext("REQ");
      expect(second[2]).toEqual({ kinds: [2] });
      socket.message(["EOSE", second[1]]);

      expect(inspector.completed).toBe(false);
      rxNostr.dispose();
      await expect(socket.closeRequested).resolves.toBeDefined();
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
      await expect(server.connections.wait(0)).resolves.toBeDefined();
      const first = server.sockets.latestFor(one);
      first.open();
      const [, firstSubId] = await first.inbox.waitNext("REQ");

      destinations.append(two);
      await expect(server.connections.wait(1)).resolves.toBeDefined();
      const second = server.sockets.latestFor(two);
      second.open();
      const [, secondSubId] = await second.inbox.waitNext("REQ");
      second.message(["EVENT", secondSubId, event({ id: "dynamic" })]);
      first.message(["EOSE", firstSubId]);
      second.message(["EOSE", secondSubId]);

      expect(inspector.completed).toBe(false);
      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "dynamic" } });

      await Promise.all(
        [...server.connections].map((socket) =>
          expect(socket.closeRequested).resolves.toBeDefined(),
        ),
      );

      for (const socket of server.connections) socket.acknowledgeClose();
      request.dispose();
      destinations.dispose();
      rxNostr.dispose();
    });
  });
});
