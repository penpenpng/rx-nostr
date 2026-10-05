import type * as Nostr from "nostr-typedef";
import {
  RelayDirectory,
  RxRelays,
  RxReq,
  VerificationClient,
  type EventPacket,
  type LazyFilter,
  type RxNostrReqInput,
} from "rx-nostr";
import { map } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import {
  createDeferred,
  createRxNostrScenario,
  Faker,
  SubscriptionInspector,
} from "../helper/index.ts";
import { settleProtocol, scenarioTest } from "../helper/protocol-scenario.ts";

const relay = "wss://relay.example.com";
const a = "wss://a.example.com";
const b = "wss://b.example.com";
const c = "wss://c.example.com";
const d = "wss://d.example.com";

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
  describe("input", () => {
    describe.each(["forward", "backward"] as const)("%s no-match filters", (strategy) => {
      test.each(["static", "emitted", "piped"] as const)(
        "%s authors:[] completes without sending REQ",
        async (input) => {
          const { server, rxNostr } = createRxNostrScenario();
          const inspector = new SubscriptionInspector<EventPacket>();
          const source = new RxReq();
          const noMatch: LazyFilter = { authors: [] };
          let request: RxNostrReqInput = source;

          if (input === "static") {
            request = [noMatch];
          } else if (input === "piped") {
            request = source.pipe(map((packet) => ({ ...packet, filters: [noMatch] })));
          }

          rxNostr[strategy](relay, request).subscribe(inspector);

          if (input !== "static") {
            source.emit(input === "piped" ? [{}] : noMatch);
            source.dispose();
          }

          await expect(inspector.waitComplete()).resolves.toBeUndefined();
          expect(server.connections.length).toBe(0);
          expect(inspector.values).toEqual([]);
          rxNostr.dispose();
        },
      );

      test("does not prewarm on a static invalid filter with defer=false", async () => {
        const { server, rxNostr } = createRxNostrScenario();
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr[strategy](relay, [{ kinds: [] }], { defer: false }).subscribe(inspector);

        await expect(inspector.waitComplete()).resolves.toBeUndefined();
        expect(server.connections.length).toBe(0);
        rxNostr.dispose();
      });
    });

    test("completes a lazy contradictory range at send time without REQ", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{ since: () => 2, until: () => 1 }]).subscribe(inspector);
      const socket = server.sockets.latest;

      socket.open();
      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(socket.inbox.length).toBe(0);
      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

    test.each(["static", "emitted", "piped"] as const)(
      "%s OR filters keep the valid branch and limit:0",
      async (input) => {
        const { server, rxNostr } = createRxNostrScenario();
        const source = new RxReq();
        const filters: LazyFilter[] = [{ authors: [] }, { kinds: [1], limit: 0 }];
        let request: RxNostrReqInput = source;

        if (input === "static") {
          request = filters;
        } else if (input === "piped") {
          request = source.pipe(map((packet) => ({ ...packet, filters })));
        }

        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(relay, request).subscribe(inspector);

        if (input !== "static") {
          source.emit(input === "piped" ? [{}] : filters);
          source.dispose();
        }

        const socket = server.sockets.latest;

        socket.open();
        const [, subId, filter] = await socket.inbox.waitNext("REQ");

        expect(filter).toEqual({ kinds: [1], limit: 0 });

        socket.message(["EVENT", subId, event({ id: "valid", kind: 1 })]);
        socket.message(["EVENT", subId, event({ id: "invalid", kind: 2 })]);
        socket.message(["EOSE", subId]);

        await expect(inspector.waitComplete()).resolves.toBeUndefined();
        expect(inspector.values.map((packet) => packet.event.id)).toEqual(["valid"]);
        await expect(socket.closeRequested).resolves.toBeDefined();
        socket.acknowledgeClose();
        rxNostr.dispose();
      },
    );

    test.each([0, () => 0])("preserves until: %s on REQ and in local matching", async (until) => {
      const { server, rxNostr } = createRxNostrScenario();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{ until }]).subscribe(inspector);
      const socket = server.sockets.latest;

      socket.open();
      const [, subId, filter] = await socket.inbox.waitNext("REQ");

      expect(filter).toEqual({ until: 0 });

      socket.message(["EVENT", subId, event({ id: "later", created_at: 1 })]);
      socket.message(["EVENT", subId, event({ id: "boundary", created_at: 0 })]);
      socket.message(["EOSE", subId]);

      await expect(inspector.waitNext()).resolves.toMatchObject({ event: { id: "boundary" } });
      await expect(inspector.waitComplete()).resolves.toBeUndefined();
      expect(inspector.values).toHaveLength(1);

      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      rxNostr.dispose();
    });

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
  });

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

  describe("forward queries", () => {
    test("derived RxReq disposal stops new filters but leaves its final segment active", async () => {
      const { server, rxNostr } = createRxNostrScenario();
      const source = new RxReq();
      const derived = source.pipe(map((packet) => packet));
      const inspector = new SubscriptionInspector<EventPacket>();
      const subscription = rxNostr.forward(relay, derived).subscribe(inspector);

      derived.emit([{ kinds: [1] }]);
      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      derived.dispose();
      source.emit([{ kinds: [2] }]);
      socket.message(["EVENT", subId, event({ id: "still-active" })]);

      await expect(inspector.waitNext()).resolves.toMatchObject({
        event: { id: "still-active" },
      });
      expect(socket.inbox.length).toBe(1);

      subscription.unsubscribe();
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", subId]);
      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      source.dispose();
      rxNostr.dispose();
    });

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

  describe("event validation", () => {
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

    test("surfaces Worker verifier failures as verifier callback errors", async () => {
      const requestId = createDeferred<number>();
      let onMessage: ((event: MessageEvent) => void) | undefined;
      const worker = {
        addEventListener(type: string, listener: (event: MessageEvent) => void) {
          if (type === "message") {
            onMessage = listener;
          }
        },
        removeEventListener(type: string) {
          if (type === "message") {
            onMessage = undefined;
          }
        },
        postMessage(message: unknown) {
          if (typeof message === "object" && message !== null && "reqId" in message) {
            requestId.resolve(message.reqId as number);
          }
        },
        terminate() {},
      } as unknown as Worker;
      const verifier = new VerificationClient({ worker });

      verifier.start();
      onMessage?.({ data: "pong" } as MessageEvent);

      const { server, rxNostr } = createRxNostrScenario({ verifier });
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr.backward(relay, [{}]).subscribe(inspector);
      const socket = server.sockets.latest;

      socket.open();
      const [, subId] = await socket.inbox.waitNext("REQ");

      socket.message(["EVENT", subId, event()]);
      const reqId = await requestId.promise;

      onMessage?.({ data: { reqId, ok: false, error: "Error: worker failed" } } as MessageEvent);
      expect(await inspector.waitError()).toMatchObject({
        name: "RxNostrCallbackError",
        callback: "verifier",
        cause: { message: "Error: worker failed" },
      });
      expect(await socket.inbox.waitNext("CLOSE")).toEqual(["CLOSE", subId]);

      await expect(socket.closeRequested).resolves.toBeDefined();
      socket.acknowledgeClose();
      rxNostr.dispose();
      verifier.dispose();
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

  describe("source completion and subscriptions", () => {
    scenarioTest(
      "drains active and queued backward requests on every subscriber after source disposal",
      async ({ createScenario }) => {
        const directory = new RelayDirectory();

        directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
        const { rxNostr, server } = createScenario({ relayDirectory: directory });

        using source = new RxReq();
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const secondInspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(a, source).subscribe(firstInspector);
        rxNostr.backward(a, source).subscribe(secondInspector);
        source.emit([{}], { traceTag: 1 });
        source.emit([{}], { traceTag: 2 });
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
        await settleProtocol();

        source.dispose();
        source.emit([{}], { traceTag: "ignored" });
        expect(firstInspector.completed).toBe(false);
        expect(secondInspector.completed).toBe(false);
        const results = [
          { inspector: secondInspector, traceTag: 1 },
          { inspector: firstInspector, traceTag: 2 },
          { inspector: secondInspector, traceTag: 2 },
        ];

        for (const [index, { inspector, traceTag }] of results.entries()) {
          const id = (await socket.inbox.waitNext("REQ"))[1];
          const event = Faker.event({ id: `result-${index + 1}` });

          socket.message(["EVENT", id, event]);
          await settleProtocol();
          await expect(inspector.waitNext()).resolves.toMatchObject({
            event,
            traceTag,
          });
          socket.message(["EOSE", id]);
          await settleProtocol();
        }

        expect(socket.inbox.length).toBe(4);
        expect(firstInspector.completed).toBe(true);
        expect(secondInspector.completed).toBe(true);
        expect(socket.isCloseRequested).toBe(true);
      },
    );

    scenarioTest(
      "keeps the shared source and other subscriber alive when one observer unsubscribes",
      async ({ createScenario }) => {
        const { rxNostr, server } = createScenario();

        using source = new RxReq();
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const first = rxNostr.forward(a, source).subscribe(firstInspector);
        const secondInspector = new SubscriptionInspector<EventPacket>();
        const second = rxNostr.forward(a, source).subscribe(secondInspector);

        source.emit([{}]);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const firstReq = await socket.inbox.waitNext("REQ");
        const secondReq = await socket.inbox.waitNext("REQ");

        first.unsubscribe();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", firstReq[1]]);
        source.emit([{}], { traceTag: "remaining" });
        await settleProtocol();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", secondReq[1]]);
        const remaining = await socket.inbox.waitNext("REQ");

        socket.message(["EVENT", remaining[1], Faker.event({ id: "remaining" })]);
        await settleProtocol();
        await expect(secondInspector.waitNext()).resolves.toMatchObject({ traceTag: "remaining" });
        expect(socket.inbox.length).toBe(5);
        expect(socket.isCloseRequested).toBe(false);
        second.unsubscribe();
      },
    );

    scenarioTest.for(["forward", "backward"] as const)(
      "%s completes without work when the source is already disposed",
      async (strategy, { createScenario }) => {
        const { rxNostr, server } = createScenario();

        using source = new RxReq();
        source.dispose();
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr[strategy](a, source).subscribe(inspector);
        await settleProtocol();
        expect(inspector.completed).toBe(true);
        expect(server.connections).toHaveLength(0);
      },
    );
  });

  describe("asynchronous event delivery", () => {
    scenarioTest(
      "a verifier failure cancels every relay's active and queued requests",
      async ({ createScenario }) => {
        const verification = createDeferred<boolean>();
        const directory = new RelayDirectory();

        for (const url of [a, b]) {
          directory.setNip11(url, { limitation: { max_subscriptions: 1 } });
        }

        const { rxNostr, server } = createScenario({
          relayDirectory: directory,
          verifier: { verifyEvent: () => verification.promise },
        });

        using source = new RxReq();
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward([a, b], source).subscribe(inspector);
        source.emit([{}]);
        source.emit([{}]);

        for (const socket of server.connections) {
          socket.open();
        }

        await settleProtocol();
        const requests = await Promise.all(
          [...server.connections].map(async (socket) => ({
            socket,
            req: await socket.inbox.waitNext("REQ"),
          })),
        );
        const first = requests.find(({ socket }) => socket.url === a)!;

        first.socket.message(["EVENT", first.req[1], Faker.event()]);
        await settleProtocol();
        const cause = new Error("verification failed");

        verification.reject(cause);
        await settleProtocol();

        await expect(inspector.waitError()).resolves.toEqual(
          expect.objectContaining({ callback: "verifier", cause }),
        );

        for (const { socket, req } of requests) {
          await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
          expect(socket.inbox.length).toBe(2);
          await expect(socket.closeRequested).resolves.toBeDefined();
        }
      },
    );

    scenarioTest.for(["unsubscribe", "dispose"] as const)(
      "ignores pending verifier results after %s",
      async (ending, { createScenario }) => {
        const verification = createDeferred<boolean>();
        const verify = vi.fn(() => verification.promise);
        const { rxNostr, server } = createScenario({ verifier: { verifyEvent: verify } });
        const inspector = new SubscriptionInspector<EventPacket>();

        const query = rxNostr.backward(a, [{}]).subscribe(inspector);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        socket.message(["EVENT", (await socket.inbox.waitNext("REQ"))[1], Faker.event()]);
        await settleProtocol();
        expect(verify).toHaveBeenCalledOnce();

        if (ending === "dispose") {
          rxNostr.dispose();
        } else {
          query.unsubscribe();
        }

        verification.resolve(true);
        await settleProtocol();
        expect(inspector.length).toBe(0);
        expect(inspector.errored).toBe(false);
        expect(socket.isCloseRequested).toBe(true);
      },
    );

    scenarioTest(
      "delivers already received events after forward replacement but ignores old wire messages",
      async ({ createScenario }) => {
        const verification = createDeferred<boolean>();
        const { rxNostr, server } = createScenario({
          verifier: { verifyEvent: () => verification.promise },
        });

        using source = new RxReq();
        const inspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.forward(a, source).subscribe(inspector);

        source.emit([{}], { traceTag: "old" });
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const old = (await socket.inbox.waitNext("REQ"))[1];

        socket.message(["EVENT", old, Faker.event({ id: "received-before-replacement" })]);
        await settleProtocol();
        source.emit([{}], { traceTag: "new" });
        await settleProtocol();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", old]);
        socket.message(["EVENT", old, Faker.event({ id: "stale-wire-message" })]);
        socket.message([
          "EVENT",
          (await socket.inbox.waitNext("REQ"))[1],
          Faker.event({ id: "new" }),
        ]);
        verification.resolve(true);
        await settleProtocol();
        await expect(inspector.waitNext()).resolves.toMatchObject({
          event: { id: "received-before-replacement" },
          traceTag: "old",
        });
        await expect(inspector.waitNext()).resolves.toMatchObject({
          event: { id: "new" },
          traceTag: "new",
        });
        query.unsubscribe();
      },
    );
  });

  describe("destinations", () => {
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

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

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

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

      destinations.dispose();
      rxNostr.dispose();
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

      for (const socket of server.connections) {
        socket.acknowledgeClose();
      }

      request.dispose();
      destinations.dispose();
      rxNostr.dispose();
    });

    for (const strategy of ["forward", "backward"] as const) {
      scenarioTest(
        `${strategy} keeps dynamic packet destinations independent from defaults and hot relays`,
        async ({ createScenario }) => {
          const { rxNostr, server } = createScenario();

          using defaults = new RxRelays([a, b]);
          using temporary = new RxRelays([b, c]);
          using source = new RxReq();
          rxNostr.setHotRelays([a, b, c, d]);

          for (const socket of server.connections) {
            socket.open();
          }

          await settleProtocol();
          const inspector = new SubscriptionInspector<EventPacket>();
          const query = rxNostr[strategy](defaults, source, { weak: true }).subscribe(inspector);

          source.emit([{}], { relays: temporary });
          await settleProtocol();
          const socketA = server.sockets.latestFor(a);

          expect(socketA.inbox.length).toBe(0);
          const socketB = server.sockets.latestFor(b);
          const reqB = await socketB.inbox.waitNext("REQ");
          const socketC = server.sockets.latestFor(c);
          const reqC = await socketC.inbox.waitNext("REQ");

          defaults.remove(b);
          defaults.append(d);
          temporary.remove(c);
          temporary.append(a);
          await settleProtocol();
          expect(socketB.inbox.length).toBe(1);
          await expect(socketC.inbox.waitNext()).resolves.toEqual(["CLOSE", reqC[1]]);
          const reqA = await socketA.inbox.waitNext("REQ");
          const socketD = server.sockets.latestFor(d);

          expect(socketD.inbox.length).toBe(0);

          source.emit([{}]);
          await settleProtocol();
          await expect(socketD.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);

          if (strategy === "forward") {
            await expect(socketB.inbox.waitNext()).resolves.toEqual(["CLOSE", reqB[1]]);
            await expect(socketA.inbox.waitNext()).resolves.toEqual(["CLOSE", reqA[1]]);
          } else {
            expect(socketB.inbox.length).toBe(1);
          }

          await expect(socketA.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
          temporary.append(c);
          await settleProtocol();
          expect(socketC.inbox.length).toBe(2);
          query.unsubscribe();
          await settleProtocol();
          expect([...server.connections].every((socket) => socket.isCloseRequested === false)).toBe(
            true,
          );
          rxNostr.unsetHotRelays();
          await settleProtocol();
          expect([...server.connections].every((socket) => socket.isCloseRequested === true)).toBe(
            true,
          );
        },
      );
    }

    scenarioTest(
      "forward restores its latest filters after all dynamic relays are removed and readded",
      async ({ createScenario }) => {
        const { rxNostr, server } = createScenario();

        using destinations = new RxRelays([a, b]);
        using source = new RxReq();
        rxNostr.setHotRelays([a, b]);

        for (const socket of server.connections) {
          socket.open();
        }

        await settleProtocol();
        const inspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.forward(destinations, source).subscribe(inspector);

        source.emit([{ kinds: [1] }]);
        await settleProtocol();
        destinations.clear();
        await settleProtocol();

        for (const socket of server.connections) {
          const req = await socket.inbox.waitNext("REQ");

          expect(req[2]).toEqual({ kinds: [1] });
          await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
        }

        destinations.append(a);
        await settleProtocol();
        const socketA = server.sockets.latestFor(a);

        expect((await socketA.inbox.waitNext("REQ"))[2]).toEqual({ kinds: [1] });
        expect(socketA.inbox.length).toBe(3);
        expect(server.sockets.latestFor(b).inbox.length).toBe(2);
        query.unsubscribe();
      },
    );

    scenarioTest(
      "backward does not restart removed or completed relays within an active request",
      async ({ createScenario }) => {
        const { rxNostr, server } = createScenario();

        using destinations = new RxRelays([a, b]);
        rxNostr.setHotRelays([a, b, c]);

        for (const socket of server.connections) {
          socket.open();
        }

        await settleProtocol();
        const inspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.backward(destinations, [{}]).subscribe(inspector);

        await settleProtocol();
        destinations.remove(a);
        destinations.append(a);
        destinations.append(c);
        await settleProtocol();
        const socketA = server.sockets.latestFor(a);
        const reqA = await socketA.inbox.waitNext("REQ");

        await expect(socketA.inbox.waitNext()).resolves.toEqual(["CLOSE", reqA[1]]);
        expect(socketA.inbox.length).toBe(2);
        await expect(server.sockets.latestFor(c).inbox.waitNext()).resolves.toEqual([
          "REQ",
          expect.any(String),
          {},
        ]);
        const socketB = server.sockets.latestFor(b);
        const reqB = await socketB.inbox.waitNext("REQ");

        socketB.message(["EOSE", reqB[1]]);
        destinations.remove(b);
        destinations.append(b);
        await settleProtocol();
        await expect(socketB.inbox.waitNext()).resolves.toEqual(["CLOSE", reqB[1]]);
        expect(socketB.inbox.length).toBe(2);
        query.unsubscribe();
      },
    );
  });

  describe("subscription limits and queued requests", () => {
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

    scenarioTest(
      "unsubscribes active and queued backward requests without briefly sending cancelled work",
      async ({ createScenario }) => {
        const directory = new RelayDirectory();

        directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
        const { rxNostr, server } = createScenario({ relayDirectory: directory });

        using source = new RxReq();
        const inspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.backward(a, source).subscribe(inspector);

        source.emit([{ kinds: [1] }]);
        source.emit([{ kinds: [2] }]);
        source.emit([{ kinds: [3] }]);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const req = await socket.inbox.waitNext("REQ");

        expect(req[2]).toEqual({ kinds: [1] });

        query.unsubscribe();
        await settleProtocol();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
        expect(socket.inbox.length).toBe(2);
      },
    );

    scenarioTest(
      "replaces queued forward work without sending superseded filters",
      async ({ createScenario }) => {
        const directory = new RelayDirectory();

        directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
        const { rxNostr, server } = createScenario({ relayDirectory: directory });

        using source = new RxReq();
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const blocker = rxNostr.backward(a, [{}]).subscribe(firstInspector);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const blockerId = (await socket.inbox.waitNext("REQ"))[1];
        const secondInspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.forward(a, source).subscribe(secondInspector);

        source.emit([{ kinds: [1] }]);
        source.emit([{ kinds: [2] }]);
        await settleProtocol();
        expect(socket.inbox.length).toBe(1);

        socket.message(["EOSE", blockerId]);
        await settleProtocol();
        await expect(socket.inbox.waitNext()).resolves.toEqual([
          "REQ",
          expect.any(String),
          { kinds: [2] },
        ]);
        query.unsubscribe();
        blocker.unsubscribe();
      },
    );

    scenarioTest(
      "removes queued work on one relay while the other relay keeps delivering",
      async ({ createScenario }) => {
        const directory = new RelayDirectory();

        directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
        const { rxNostr, server } = createScenario({ relayDirectory: directory });

        using destinations = new RxRelays([a, b]);
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const blocker = rxNostr.backward(a, [{}]).subscribe(firstInspector);
        const secondInspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(destinations, [{}]).subscribe(secondInspector);

        for (const socket of server.connections) {
          socket.open();
        }

        await settleProtocol();
        destinations.remove(a);
        const first = server.sockets.latestFor(a);
        const second = server.sockets.latestFor(b);

        first.message(["EOSE", (await first.inbox.waitNext("REQ"))[1]]);
        const [, secondId] = await second.inbox.waitNext("REQ");

        second.message(["EVENT", secondId, Faker.event()]);
        second.message(["EOSE", secondId]);
        await settleProtocol();
        expect(first.inbox.length).toBe(1);
        await expect(secondInspector.waitNext()).resolves.toMatchObject({ from: b });
        expect(secondInspector.completed).toBe(true);
        blocker.unsubscribe();
      },
    );
  });

  describe("reconnection", () => {
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

    scenarioTest.for(["replace", "remove"] as const)(
      "does not recover obsolete work after %s during retry",
      async (change, { createScenario }) => {
        const { rxNostr, server } = createScenario({
          reconnector: { reconnect: () => ({ action: "retry", delay: 100 }) },
        });

        using destinations = new RxRelays([a]);
        using source = new RxReq();
        rxNostr.setHotRelays(a);
        const inspector = new SubscriptionInspector<EventPacket>();
        const query = rxNostr.forward(destinations, source).subscribe(inspector);

        source.emit([{ kinds: [1] }]);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const initial = await socket.inbox.waitNext("REQ");

        expect(initial[2]).toEqual({ kinds: [1] });
        socket.peerClose(1006, "offline");
        await settleProtocol();

        if (change === "replace") {
          source.emit([{ kinds: [2] }]);
        } else {
          destinations.clear();
        }

        await vi.advanceTimersByTimeAsync(100);
        const recovered = server.sockets.latest;

        expect(server.connections).toHaveLength(2);
        recovered.open();
        await settleProtocol();
        await expect(recovered.inbox.waitNext()).resolves.toEqual(["CLOSE", initial[1]]);

        if (change === "replace") {
          await expect(recovered.inbox.waitNext()).resolves.toEqual([
            "REQ",
            expect.any(String),
            { kinds: [2] },
          ]);
        } else {
          expect(recovered.inbox.length).toBe(1);
        }

        query.unsubscribe();
      },
    );
  });
});
