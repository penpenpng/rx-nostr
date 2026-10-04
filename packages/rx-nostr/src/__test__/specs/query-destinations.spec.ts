import { NoopSigner, RxRelays, RxReq, type EventPacket } from "rx-nostr";
import { describe, expect, vi } from "vitest";

import { Faker } from "../helper/index.ts";
import { settleQuery, queryTest as test } from "../helper/query-lifecycle-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const a = "wss://a.example.com";
const b = "wss://b.example.com";
const c = "wss://c.example.com";
const d = "wss://d.example.com";

describe("weak queries with packet destinations", () => {
  test.for(["hot-first", "query-first", "publish-first"] as const)(
    "shares one socket across hot, query, publish and weak work when ending %s",
    async (order, { createScenario }) => {
      const { rxNostr, server } = createScenario({ signer: new NoopSigner() });
      rxNostr.setHotRelays(b);
      const firstInspector = new SubscriptionInspector<EventPacket>();
      const owner = rxNostr.forward(b, [{}]).subscribe(firstInspector);
      const publication = rxNostr.publish(b, Faker.event({ id: "published" }), { linger: 0 });
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      const secondInspector = new SubscriptionInspector<EventPacket>();
      const weak = rxNostr.forward(b, [{}], { weak: true }).subscribe(secondInspector);
      await settleQuery();
      const endHot = () => rxNostr.unsetHotRelays();
      const endQuery = () => owner.unsubscribe();
      const endPublish = () => socket.message(["OK", "published", true, "saved"]);
      const endings =
        order === "hot-first"
          ? [endHot, endQuery, endPublish]
          : order === "query-first"
            ? [endQuery, endPublish, endHot]
            : [endPublish, endHot, endQuery];
      for (const end of endings.slice(0, 2)) {
        end();
        await settleQuery();
        expect(socket.isCloseRequested).toBe(false);
      }
      endings[2]!();
      await settleQuery();
      await expect(publication.waitFor("all")).resolves.toBeUndefined();
      expect(socket.isCloseRequested).toBe(true);
      expect(server.connections).toHaveLength(1);
      const sent = socket.inbox.length;
      weak.unsubscribe();
      await settleQuery();
      expect(socket.inbox.length).toBe(sent);
    },
  );

  for (const strategy of ["forward", "backward"] as const) {
    test(`${strategy} cannot extend the last owner's lingering lease`, async ({
      createScenario,
    }) => {
      const { rxNostr, server } = createScenario();
      const firstInspector = new SubscriptionInspector<EventPacket>();
      rxNostr.backward(b, [{}], { linger: 100 }).subscribe(firstInspector);
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
      await vi.advanceTimersByTimeAsync(50);
      const secondInspector = new SubscriptionInspector<EventPacket>();
      const weak = rxNostr[strategy](b, [{}], { weak: true, linger: Infinity }).subscribe(
        secondInspector,
      );
      await settleQuery();
      await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
      expect(socket.inbox.length).toBe(2);
      await vi.advanceTimersByTimeAsync(49);
      expect(socket.isCloseRequested).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.isCloseRequested).toBe(true);
      socket.acknowledgeClose();
      weak.unsubscribe();
      await settleQuery();
      expect(server.connections).toHaveLength(1);
    });

    test.for(["opening", "ready", "lingering"] as const)(
      `${strategy} uses an existing %s lease without opening other destinations`,
      async (state, { createScenario }) => {
        const { rxNostr, server } = createScenario();
        using source = new RxReq();
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const secondInspector = new SubscriptionInspector<EventPacket>();
        const owner = rxNostr.backward(b, [{}], { linger: 100 }).subscribe(secondInspector);
        const socket = server.sockets.latest;
        if (state !== "opening") {
          socket.open();
          await settleQuery();
        }
        if (state === "lingering") {
          socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
          await settleQuery();
        }
        const weak = rxNostr[strategy](a, source, { weak: true, defer: false }).subscribe(
          firstInspector,
        );

        // The unleased destination comes first to exercise synchronous relay completion.
        source.emit([{}], { relays: [c, b], traceTag: "temporary" });
        await settleQuery();
        expect([...server.connections].map((connection) => connection.url)).toEqual([b]);
        if (state === "opening") {
          expect(socket.inbox.length).toBe(0);
          socket.open();
          await settleQuery();
        }
        if (state !== "lingering") {
          await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
        }
        const [, id] = await socket.inbox.waitNext("REQ");
        expect(socket.inbox.length).toBe(2);
        socket.message(["EVENT", id, Faker.event({ id: "weak-result" })]);
        await settleQuery();
        await expect(firstInspector.waitNext()).resolves.toMatchObject({
          from: b,
          traceTag: "temporary",
          event: { id: "weak-result" },
        });

        weak.unsubscribe();
        await settleQuery();
        await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", id]);
        expect(socket.isCloseRequested).toBe(false);
        owner.unsubscribe();
      },
    );

    test(`${strategy} does not resurrect an unleased packet after another operation connects`, async ({
      createScenario,
    }) => {
      const { rxNostr, server } = createScenario();
      using source = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();
      const weak = rxNostr[strategy](a, source, { weak: true }).subscribe(inspector);
      source.emit([{}], { relays: c });
      await settleQuery();
      expect(server.connections).toHaveLength(0);

      rxNostr.setHotRelays(c);
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      expect(socket.inbox.length).toBe(0);
      source.emit([{}], { relays: c });
      await settleQuery();
      await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
      weak.unsubscribe();
    });

    test(`${strategy} keeps dynamic packet destinations independent from defaults and hot relays`, async ({
      createScenario,
    }) => {
      const { rxNostr, server } = createScenario();
      using defaults = new RxRelays([a, b]);
      using temporary = new RxRelays([b, c]);
      using source = new RxReq();
      rxNostr.setHotRelays([a, b, c, d]);
      for (const socket of server.connections) socket.open();
      await settleQuery();
      const inspector = new SubscriptionInspector<EventPacket>();
      const query = rxNostr[strategy](defaults, source, { weak: true }).subscribe(inspector);
      source.emit([{}], { relays: temporary });
      await settleQuery();
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
      await settleQuery();
      expect(socketB.inbox.length).toBe(1);
      await expect(socketC.inbox.waitNext()).resolves.toEqual(["CLOSE", reqC[1]]);
      const reqA = await socketA.inbox.waitNext("REQ");
      const socketD = server.sockets.latestFor(d);
      expect(socketD.inbox.length).toBe(0);

      source.emit([{}]);
      await settleQuery();
      await expect(socketD.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
      if (strategy === "forward") {
        await expect(socketB.inbox.waitNext()).resolves.toEqual(["CLOSE", reqB[1]]);
        await expect(socketA.inbox.waitNext()).resolves.toEqual(["CLOSE", reqA[1]]);
      } else {
        expect(socketB.inbox.length).toBe(1);
      }
      await expect(socketA.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
      temporary.append(c);
      await settleQuery();
      expect(socketC.inbox.length).toBe(2);
      query.unsubscribe();
      await settleQuery();
      expect([...server.connections].every((socket) => socket.isCloseRequested === false)).toBe(
        true,
      );
      rxNostr.unsetHotRelays();
      await settleQuery();
      expect([...server.connections].every((socket) => socket.isCloseRequested === true)).toBe(
        true,
      );
    });

    test(`${strategy} releases a removed prewarm relay before any emit`, async ({
      createScenario,
    }) => {
      const { rxNostr, server } = createScenario();
      using destinations = new RxRelays([a, b]);
      using source = new RxReq();
      const inspector = new SubscriptionInspector<EventPacket>();
      const query = rxNostr[strategy](destinations, source, { defer: false }).subscribe(inspector);
      for (const socket of server.connections) socket.open();
      await settleQuery();
      destinations.remove(a);
      await settleQuery();
      expect(server.sockets.latestFor(a).isCloseRequested).toBe(true);
      expect(server.sockets.latestFor(b).isCloseRequested).toBe(false);
      expect([...server.connections].every((socket) => socket.inbox.length === 0)).toBe(true);
      query.unsubscribe();
    });
  }

  test("forward restores its latest filters after all dynamic relays are removed and readded", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    using destinations = new RxRelays([a, b]);
    using source = new RxReq();
    rxNostr.setHotRelays([a, b]);
    for (const socket of server.connections) socket.open();
    await settleQuery();
    const inspector = new SubscriptionInspector<EventPacket>();
    const query = rxNostr.forward(destinations, source).subscribe(inspector);
    source.emit([{ kinds: [1] }]);
    await settleQuery();
    destinations.clear();
    await settleQuery();
    for (const socket of server.connections) {
      const req = await socket.inbox.waitNext("REQ");
      expect(req[2]).toEqual({ kinds: [1] });
      await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
    }
    destinations.append(a);
    await settleQuery();
    const socketA = server.sockets.latestFor(a);
    expect((await socketA.inbox.waitNext("REQ"))[2]).toEqual({ kinds: [1] });
    expect(socketA.inbox.length).toBe(3);
    expect(server.sockets.latestFor(b).inbox.length).toBe(2);
    query.unsubscribe();
  });

  test("backward does not restart removed or completed relays within an active request", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    using destinations = new RxRelays([a, b]);
    rxNostr.setHotRelays([a, b, c]);
    for (const socket of server.connections) socket.open();
    await settleQuery();
    const inspector = new SubscriptionInspector<EventPacket>();
    const query = rxNostr.backward(destinations, [{}]).subscribe(inspector);
    await settleQuery();
    destinations.remove(a);
    destinations.append(a);
    destinations.append(c);
    await settleQuery();
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
    await settleQuery();
    await expect(socketB.inbox.waitNext()).resolves.toEqual(["CLOSE", reqB[1]]);
    expect(socketB.inbox.length).toBe(2);
    query.unsubscribe();
  });
});
