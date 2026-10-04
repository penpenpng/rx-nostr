import { RelayDirectory, RxReq, type EventPacket } from "rx-nostr";
import { describe, expect, vi } from "vitest";

import { createDeferred, Faker } from "../helper/index.ts";
import { settleQuery, queryTest as test } from "../helper/query-lifecycle-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const a = "wss://a.example.com";
const b = "wss://b.example.com";

describe("RxReq source completion", () => {
  test("drains active and queued backward requests on every subscriber after source disposal", async ({
    createScenario,
  }) => {
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
    await settleQuery();
    socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
    await settleQuery();

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
      await settleQuery();
      await expect(inspector.waitNext()).resolves.toMatchObject({ event, traceTag });
      socket.message(["EOSE", id]);
      await settleQuery();
    }

    expect(socket.inbox.length).toBe(4);
    expect(firstInspector.completed).toBe(true);
    expect(secondInspector.completed).toBe(true);
    expect(socket.isCloseRequested).toBe(true);
  });

  test("keeps the shared source and other subscriber alive when one observer unsubscribes", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    using source = new RxReq();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const first = rxNostr.forward(a, source).subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();
    const second = rxNostr.forward(a, source).subscribe(secondInspector);
    source.emit([{}]);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    const firstReq = await socket.inbox.waitNext("REQ");
    const secondReq = await socket.inbox.waitNext("REQ");
    first.unsubscribe();
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", firstReq[1]]);
    source.emit([{}], { traceTag: "remaining" });
    await settleQuery();
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", secondReq[1]]);
    const remaining = await socket.inbox.waitNext("REQ");
    socket.message(["EVENT", remaining[1], Faker.event({ id: "remaining" })]);
    await settleQuery();
    await expect(secondInspector.waitNext()).resolves.toMatchObject({ traceTag: "remaining" });
    expect(socket.inbox.length).toBe(5);
    expect(socket.isCloseRequested).toBe(false);
    second.unsubscribe();
  });

  test.for(["forward", "backward"] as const)(
    "%s completes without work when the source is already disposed",
    async (strategy, { createScenario }) => {
      const { rxNostr, server } = createScenario();
      using source = new RxReq();
      source.dispose();
      const inspector = new SubscriptionInspector<EventPacket>();

      rxNostr[strategy](a, source).subscribe(inspector);
      await settleQuery();
      expect(inspector.completed).toBe(true);
      expect(server.connections).toHaveLength(0);
    },
  );
});

describe("asynchronous verification and query lifetime", () => {
  test("a verifier failure cancels every relay's active and queued requests", async ({
    createScenario,
  }) => {
    const verification = createDeferred<boolean>();
    const directory = new RelayDirectory();
    for (const url of [a, b]) directory.setNip11(url, { limitation: { max_subscriptions: 1 } });
    const { rxNostr, server } = createScenario({
      relayDirectory: directory,
      verifier: { verifyEvent: () => verification.promise },
    });
    using source = new RxReq();
    const inspector = new SubscriptionInspector<EventPacket>();

    rxNostr.backward([a, b], source).subscribe(inspector);
    source.emit([{}]);
    source.emit([{}]);
    for (const socket of server.connections) socket.open();
    await settleQuery();
    const requests = await Promise.all(
      [...server.connections].map(async (socket) => ({
        socket,
        req: await socket.inbox.waitNext("REQ"),
      })),
    );
    const first = requests.find(({ socket }) => socket.url === a)!;
    first.socket.message(["EVENT", first.req[1], Faker.event()]);
    await settleQuery();
    const cause = new Error("verification failed");
    verification.reject(cause);
    await settleQuery();

    await expect(inspector.waitError()).resolves.toEqual(
      expect.objectContaining({ callback: "verifier", cause }),
    );
    for (const { socket, req } of requests) {
      await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
      expect(socket.inbox.length).toBe(2);
      await expect(socket.closeRequested).resolves.toBeDefined();
    }
  });

  test.for(["unsubscribe", "dispose"] as const)(
    "ignores pending verifier results after %s",
    async (ending, { createScenario }) => {
      const verification = createDeferred<boolean>();
      const verify = vi.fn(() => verification.promise);
      const { rxNostr, server } = createScenario({ verifier: { verifyEvent: verify } });
      const inspector = new SubscriptionInspector<EventPacket>();

      const query = rxNostr.backward(a, [{}]).subscribe(inspector);
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      socket.message(["EVENT", (await socket.inbox.waitNext("REQ"))[1], Faker.event()]);
      await settleQuery();
      expect(verify).toHaveBeenCalledOnce();

      if (ending === "dispose") rxNostr.dispose();
      else query.unsubscribe();
      verification.resolve(true);
      await settleQuery();
      expect(inspector.length).toBe(0);
      expect(inspector.errored).toBe(false);
      expect(socket.isCloseRequested).toBe(true);
    },
  );

  test("delivers already received events after forward replacement but ignores old wire messages", async ({
    createScenario,
  }) => {
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
    await settleQuery();
    const old = (await socket.inbox.waitNext("REQ"))[1];
    socket.message(["EVENT", old, Faker.event({ id: "received-before-replacement" })]);
    await settleQuery();
    source.emit([{}], { traceTag: "new" });
    await settleQuery();
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", old]);
    socket.message(["EVENT", old, Faker.event({ id: "stale-wire-message" })]);
    socket.message(["EVENT", (await socket.inbox.waitNext("REQ"))[1], Faker.event({ id: "new" })]);
    verification.resolve(true);
    await settleQuery();
    await expect(inspector.waitNext()).resolves.toMatchObject({
      event: { id: "received-before-replacement" },
      traceTag: "old",
    });
    await expect(inspector.waitNext()).resolves.toMatchObject({
      event: { id: "new" },
      traceTag: "new",
    });
    query.unsubscribe();
  });
});

describe("RxNostr disposal across relay states", () => {
  test("closes ready, opening and lingering sockets and cancels retry and queued work", async ({
    createScenario,
  }) => {
    const opening = "wss://opening.example.com";
    const retrying = "wss://retrying.example.com";
    const directory = new RelayDirectory();
    directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
    const { rxNostr, server } = createScenario({
      relayDirectory: directory,
      reconnector: { reconnect: () => ({ action: "retry", delay: 100 }) },
    });
    using source = new RxReq();
    const firstInspector = new SubscriptionInspector<EventPacket>();

    rxNostr.backward(a, source).subscribe(firstInspector);
    source.emit([{}]);
    source.emit([{}]);
    const secondInspector = new SubscriptionInspector<EventPacket>();
    rxNostr.backward(b, [{}], { linger: Infinity }).subscribe(secondInspector);
    rxNostr.setHotRelays([opening, retrying]);
    for (const socket of server.connections) if (socket.url !== opening) socket.open();
    await settleQuery();
    const socketB = server.sockets.latestFor(b);
    socketB.message(["EOSE", (await socketB.inbox.waitNext("REQ"))[1]]);
    server.sockets.latestFor(retrying).peerClose(1006, "offline");
    await settleQuery();

    rxNostr.dispose();
    rxNostr.dispose();
    await settleQuery();
    expect(firstInspector.completed).toBe(true);
    for (const url of [a, b, opening]) {
      const socket = server.sockets.latestFor(url);
      expect(socket.isCloseRequested).toBe(true);
      socket.acknowledgeClose();
    }
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.connections).toHaveLength(4);
    expect(server.sockets.latestFor(a).inbox.length).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
