import { describe, expect, vi } from "vitest";
import { RelayDirectory, RxReq, type EventPacket } from "rx-nostr";
import { createDeferred, Faker } from "../helper/index.ts";
import { queryTest as test, settleQuery } from "../helper/query-lifecycle-scenario.ts";

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
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    const first: EventPacket[] = [];
    const second: EventPacket[] = [];
    rxNostr
      .backward(a, source)
      .subscribe({ next: (packet) => first.push(packet), complete: firstComplete });
    rxNostr
      .backward(a, source)
      .subscribe({ next: (packet) => second.push(packet), complete: secondComplete });
    source.emit([{}], { traceTag: 1 });
    source.emit([{}], { traceTag: 2 });
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    socket.message(["EOSE", socket.latestSent("REQ")[1]]);
    await settleQuery();

    source.dispose();
    source.emit([{}], { traceTag: "ignored" });
    expect(firstComplete).not.toHaveBeenCalled();
    expect(secondComplete).not.toHaveBeenCalled();
    for (let index = 1; index < 4; index++) {
      const id = socket.latestSent("REQ")[1];
      socket.message(["EVENT", id, Faker.event({ id: `result-${index}` })]);
      socket.message(["EOSE", id]);
      await settleQuery();
    }

    expect(socket.sentOfType("REQ")).toHaveLength(4);
    expect(first.map((packet) => packet.traceTag)).toEqual([2]);
    expect(second.map((packet) => packet.traceTag)).toEqual([1, 2]);
    expect(firstComplete).toHaveBeenCalledOnce();
    expect(secondComplete).toHaveBeenCalledOnce();
    expect(socket.sentOfType("CLOSE")).toHaveLength(0);
    expect(socket.closeRequests).toHaveLength(1);
  });

  test("keeps the shared source and other subscriber alive when one observer unsubscribes", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    using source = new RxReq();
    const first = rxNostr.forward(a, source).subscribe();
    const packets: EventPacket[] = [];
    const second = rxNostr.forward(a, source).subscribe((packet) => packets.push(packet));
    source.emit([{}]);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    first.unsubscribe();
    source.emit([{}], { traceTag: "remaining" });
    await settleQuery();
    socket.message(["EVENT", socket.latestSent("REQ")[1], Faker.event({ id: "remaining" })]);
    await settleQuery();
    expect(packets).toMatchObject([{ traceTag: "remaining" }]);
    expect(socket.sentOfType("REQ")).toHaveLength(3);
    expect(socket.closeRequests).toHaveLength(0);
    second.unsubscribe();
  });

  test.for(["forward", "backward"] as const)(
    "%s completes without work when the source is already disposed",
    async (strategy, { createScenario }) => {
      const { rxNostr, server } = createScenario();
      using source = new RxReq();
      source.dispose();
      const complete = vi.fn();
      rxNostr[strategy](a, source).subscribe({ complete });
      await settleQuery();
      expect(complete).toHaveBeenCalledOnce();
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
    const error = vi.fn();
    rxNostr.backward([a, b], source).subscribe({ error });
    source.emit([{}]);
    source.emit([{}]);
    for (const socket of server.connections) socket.open();
    await settleQuery();
    const socket = server.sockets.latestFor(a);
    socket.message(["EVENT", socket.latestSent("REQ")[1], Faker.event()]);
    await settleQuery();
    const cause = new Error("verification failed");
    verification.reject(cause);
    await settleQuery();

    expect(error).toHaveBeenCalledWith(expect.objectContaining({ callback: "verifier", cause }));
    for (const connection of server.connections) {
      expect(connection.sentOfType("REQ")).toHaveLength(1);
      expect(connection.sentOfType("CLOSE")).toHaveLength(1);
      expect(connection.closeRequests).toHaveLength(1);
    }
  });

  test.for(["unsubscribe", "dispose"] as const)(
    "ignores pending verifier results after %s",
    async (ending, { createScenario }) => {
      const verification = createDeferred<boolean>();
      const verify = vi.fn(() => verification.promise);
      const { rxNostr, server } = createScenario({ verifier: { verifyEvent: verify } });
      const next = vi.fn();
      const error = vi.fn();
      const query = rxNostr.backward(a, [{}]).subscribe({ next, error });
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      socket.message(["EVENT", socket.latestSent("REQ")[1], Faker.event()]);
      await settleQuery();
      expect(verify).toHaveBeenCalledOnce();

      if (ending === "dispose") rxNostr.dispose();
      else query.unsubscribe();
      verification.resolve(true);
      await settleQuery();
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(socket.closeRequests).toHaveLength(1);
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
    const packets: EventPacket[] = [];
    const query = rxNostr.forward(a, source).subscribe((packet) => packets.push(packet));
    source.emit([{}], { traceTag: "old" });
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    const old = socket.latestSent("REQ")[1];
    socket.message(["EVENT", old, Faker.event({ id: "received-before-replacement" })]);
    await settleQuery();
    source.emit([{}], { traceTag: "new" });
    await settleQuery();
    socket.message(["EVENT", old, Faker.event({ id: "stale-wire-message" })]);
    socket.message(["EVENT", socket.latestSent("REQ")[1], Faker.event({ id: "new" })]);
    verification.resolve(true);
    await settleQuery();
    expect(packets.map((packet) => [packet.event.id, packet.traceTag])).toEqual([
      ["received-before-replacement", "old"],
      ["new", "new"],
    ]);
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
    const complete = vi.fn();
    rxNostr.backward(a, source).subscribe({ complete });
    source.emit([{}]);
    source.emit([{}]);
    rxNostr.backward(b, [{}], { linger: Infinity }).subscribe();
    rxNostr.setHotRelays([opening, retrying]);
    for (const socket of server.connections) if (socket.url !== opening) socket.open();
    await settleQuery();
    server.sockets.latestFor(b).message(["EOSE", server.sockets.latestFor(b).latestSent("REQ")[1]]);
    server.sockets.latestFor(retrying).peerClose(1006, "offline");
    await settleQuery();

    rxNostr.dispose();
    rxNostr.dispose();
    await settleQuery();
    expect(complete).toHaveBeenCalledOnce();
    for (const url of [a, b, opening]) {
      expect(server.sockets.latestFor(url).closeRequests).toHaveLength(1);
      server.sockets.latestFor(url).acknowledgeClose();
    }
    await vi.advanceTimersByTimeAsync(1_000);
    expect(server.connections).toHaveLength(4);
    expect(server.sockets.latestFor(a).sentOfType("REQ")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
