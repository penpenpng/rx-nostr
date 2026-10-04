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
        expect(socket.closeRequests).toHaveLength(0);
      }
      endings[2]!();
      await settleQuery();
      await expect(publication.waitFor("all")).resolves.toBeUndefined();
      expect(socket.closeRequests).toHaveLength(1);
      expect(server.connections).toHaveLength(1);
      const sent = socket.sent.length;
      weak.unsubscribe();
      await settleQuery();
      expect(socket.sent.length).toBe(sent);
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
      socket.message(["EOSE", socket.latestSent("REQ")[1]]);
      await vi.advanceTimersByTimeAsync(50);
      const secondInspector = new SubscriptionInspector<EventPacket>();
      const weak = rxNostr[strategy](b, [{}], { weak: true, linger: Infinity }).subscribe(
        secondInspector,
      );
      await settleQuery();
      expect(socket.sentOfType("REQ")).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(49);
      expect(socket.closeRequests).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.closeRequests).toHaveLength(1);
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
          socket.message(["EOSE", socket.latestSent("REQ")[1]]);
          await settleQuery();
        }
        const weak = rxNostr[strategy](a, source, { weak: true, defer: false }).subscribe(
          firstInspector,
        );

        // The unleased destination comes first to exercise synchronous relay completion.
        source.emit([{}], { relays: [c, b], traceTag: "temporary" });
        await settleQuery();
        expect(server.connections.map((connection) => connection.url)).toEqual([b]);
        if (state === "opening") {
          expect(socket.sent).toHaveLength(0);
          socket.open();
          await settleQuery();
        }
        expect(socket.sentOfType("REQ")).toHaveLength(2);
        const id = socket.latestSent("REQ")[1];
        socket.message(["EVENT", id, Faker.event({ id: "weak-result" })]);
        await settleQuery();
        await expect(firstInspector.waitNext()).resolves.toMatchObject({
          from: b,
          traceTag: "temporary",
          event: { id: "weak-result" },
        });

        weak.unsubscribe();
        await settleQuery();
        expect(socket.sentOfType("CLOSE")).toContainEqual(["CLOSE", id]);
        expect(socket.closeRequests).toHaveLength(0);
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
      expect(socket.sent).toHaveLength(0);
      source.emit([{}], { relays: c });
      await settleQuery();
      expect(socket.sentOfType("REQ")).toHaveLength(1);
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
      expect(socketA.sent).toHaveLength(0);
      const socketB = server.sockets.latestFor(b);
      expect(socketB.sentOfType("REQ")).toHaveLength(1);
      const socketC = server.sockets.latestFor(c);
      expect(socketC.sentOfType("REQ")).toHaveLength(1);

      defaults.remove(b);
      defaults.append(d);
      temporary.remove(c);
      temporary.append(a);
      await settleQuery();
      expect(socketB.sentOfType("CLOSE")).toHaveLength(0);
      expect(socketC.sentOfType("CLOSE")).toHaveLength(1);
      expect(socketA.sentOfType("REQ")).toHaveLength(1);
      const socketD = server.sockets.latestFor(d);
      expect(socketD.sent).toHaveLength(0);

      source.emit([{}]);
      await settleQuery();
      expect(socketD.sentOfType("REQ")).toHaveLength(1);
      expect(socketB.sentOfType("CLOSE")).toHaveLength(strategy === "forward" ? 1 : 0);
      temporary.append(c);
      await settleQuery();
      expect(socketC.sentOfType("REQ")).toHaveLength(1);
      query.unsubscribe();
      await settleQuery();
      expect(server.connections.every((socket) => socket.closeRequests.length === 0)).toBe(true);
      rxNostr.unsetHotRelays();
      await settleQuery();
      expect(server.connections.every((socket) => socket.closeRequests.length === 1)).toBe(true);
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
      expect(server.sockets.latestFor(a).closeRequests).toHaveLength(1);
      expect(server.sockets.latestFor(b).closeRequests).toHaveLength(0);
      expect(server.connections.every((socket) => socket.sent.length === 0)).toBe(true);
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
    for (const socket of server.connections) expect(socket.sentOfType("CLOSE")).toHaveLength(1);
    destinations.append(a);
    await settleQuery();
    const socketA = server.sockets.latestFor(a);
    expect(socketA.latestSent("REQ")[2]).toEqual({ kinds: [1] });
    expect(socketA.sentOfType("REQ")).toHaveLength(2);
    expect(server.sockets.latestFor(b).sentOfType("REQ")).toHaveLength(1);
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
    expect(server.sockets.latestFor(a).sentOfType("REQ")).toHaveLength(1);
    expect(server.sockets.latestFor(c).sentOfType("REQ")).toHaveLength(1);
    const socketB = server.sockets.latestFor(b);
    socketB.message(["EOSE", socketB.latestSent("REQ")[1]]);
    destinations.remove(b);
    destinations.append(b);
    await settleQuery();
    expect(socketB.sentOfType("REQ")).toHaveLength(1);
    query.unsubscribe();
  });
});
