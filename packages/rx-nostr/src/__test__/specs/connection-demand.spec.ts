import { NoopSigner, RxRelays, RxReq, type EventPacket } from "rx-nostr";
import { describe, expect, test, vi } from "vitest";

import {
  createPublicationScenario,
  Faker,
  publicationEvent as event,
  publicationRelay1 as relay1,
  publicationRelay2 as relay2,
  publicationSocket as socket,
} from "../helper/index.ts";
import { settleProtocol, scenarioTest } from "../helper/protocol-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const relay = "wss://linger.example.com";
const a = "wss://a.example.com";
const b = "wss://b.example.com";
const c = "wss://c.example.com";

describe("connection demand public contract", () => {
  describe("shared demand and hot relays", () => {
    scenarioTest.for(["hot-first", "query-first", "publish-first"] as const)(
      "shares one socket across hot, query, publish and weak work when ending %s",
      async (order, { createScenario }) => {
        const { rxNostr, server } = createScenario({ signer: new NoopSigner() });

        rxNostr.setHotRelays(b);
        const firstInspector = new SubscriptionInspector<EventPacket>();
        const owner = rxNostr.forward(b, [{}]).subscribe(firstInspector);
        const publication = rxNostr.publish(b, Faker.event({ id: "published" }), { linger: 0 });
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        const secondInspector = new SubscriptionInspector<EventPacket>();
        const weak = rxNostr.forward(b, [{}], { weak: true }).subscribe(secondInspector);

        await settleProtocol();
        const endHot = () => rxNostr.unsetHotRelays();
        const endQuery = () => owner.unsubscribe();
        const endPublish = () => socket.message(["OK", "published", true, "saved"]);
        let endings: Array<() => void>;

        switch (order) {
          case "hot-first":
            endings = [endHot, endQuery, endPublish];

            break;
          case "query-first":
            endings = [endQuery, endPublish, endHot];

            break;
          default:
            endings = [endPublish, endHot, endQuery];
        }

        for (const end of endings.slice(0, 2)) {
          end();
          await settleProtocol();
          expect(socket.isCloseRequested).toBe(false);
        }

        endings[2]!();
        await settleProtocol();
        await expect(publication.waitFor("all")).resolves.toBeUndefined();
        expect(socket.isCloseRequested).toBe(true);
        expect(server.connections).toHaveLength(1);
        const sent = socket.inbox.length;

        weak.unsubscribe();
        await settleProtocol();
        expect(socket.inbox.length).toBe(sent);
      },
    );

    test("keeps a hot relay connected while releasing a cold publish relay", async () => {
      const { server, rxNostr } = createPublicationScenario();

      rxNostr.setHotRelays([relay1]);
      const hot = socket(server, relay1);

      hot.open();

      const publication = rxNostr.publish([relay1, relay2], event());
      const cold = socket(server, relay2);

      cold.open();
      await Promise.all([
        expect(hot.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
        expect(cold.inbox.waitNext()).resolves.toEqual(["EVENT", expect.any(Object)]),
      ]);
      hot.message(["OK", "event", true, "saved"]);
      cold.message(["OK", "event", true, "saved"]);
      await expect(publication.waitFor("all")).resolves.toBeUndefined();

      await expect(cold.closeRequested).resolves.toBeDefined();
      expect(hot.isCloseRequested).toBe(false);

      rxNostr.unsetHotRelays();
      await expect(hot.closeRequested).resolves.toBeDefined();

      cold.acknowledgeClose();
      hot.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("weak operations", () => {
    for (const strategy of ["forward", "backward"] as const) {
      scenarioTest(
        `${strategy} cannot extend the last owner's lingering lease`,
        async ({ createScenario }) => {
          const { rxNostr, server } = createScenario();
          const firstInspector = new SubscriptionInspector<EventPacket>();

          rxNostr.backward(b, [{}], { linger: 100 }).subscribe(firstInspector);
          const socket = server.sockets.latest;

          socket.open();
          await settleProtocol();
          socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
          await vi.advanceTimersByTimeAsync(50);
          const secondInspector = new SubscriptionInspector<EventPacket>();
          const weak = rxNostr[strategy](b, [{}], { weak: true, linger: Infinity }).subscribe(
            secondInspector,
          );

          await settleProtocol();
          await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
          expect(socket.inbox.length).toBe(2);
          await vi.advanceTimersByTimeAsync(49);
          expect(socket.isCloseRequested).toBe(false);
          await vi.advanceTimersByTimeAsync(1);
          expect(socket.isCloseRequested).toBe(true);
          socket.acknowledgeClose();
          weak.unsubscribe();
          await settleProtocol();
          expect(server.connections).toHaveLength(1);
        },
      );

      scenarioTest.for(["opening", "ready", "lingering"] as const)(
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
            await settleProtocol();
          }
          if (state === "lingering") {
            socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
            await settleProtocol();
          }

          const weak = rxNostr[strategy](a, source, { weak: true, defer: false }).subscribe(
            firstInspector,
          );

          // The unleased destination comes first to exercise synchronous relay completion.
          source.emit([{}], { relays: [c, b], traceTag: "temporary" });
          await settleProtocol();
          expect([...server.connections].map((connection) => connection.url)).toEqual([b]);

          if (state === "opening") {
            expect(socket.inbox.length).toBe(0);
            socket.open();
            await settleProtocol();
          }
          if (state !== "lingering") {
            await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
          }

          const [, id] = await socket.inbox.waitNext("REQ");

          expect(socket.inbox.length).toBe(2);
          socket.message(["EVENT", id, Faker.event({ id: "weak-result" })]);
          await settleProtocol();
          await expect(firstInspector.waitNext()).resolves.toMatchObject({
            from: b,
            traceTag: "temporary",
            event: { id: "weak-result" },
          });

          weak.unsubscribe();
          await settleProtocol();
          await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", id]);
          expect(socket.isCloseRequested).toBe(false);
          owner.unsubscribe();
        },
      );

      scenarioTest(
        `${strategy} does not resurrect an unleased packet after another operation connects`,
        async ({ createScenario }) => {
          const { rxNostr, server } = createScenario();

          using source = new RxReq();
          const inspector = new SubscriptionInspector<EventPacket>();
          const weak = rxNostr[strategy](a, source, { weak: true }).subscribe(inspector);

          source.emit([{}], { relays: c });
          await settleProtocol();
          expect(server.connections).toHaveLength(0);

          rxNostr.setHotRelays(c);
          const socket = server.sockets.latest;

          socket.open();
          await settleProtocol();
          expect(socket.inbox.length).toBe(0);
          source.emit([{}], { relays: c });
          await settleProtocol();
          await expect(socket.inbox.waitNext()).resolves.toEqual(["REQ", expect.any(String), {}]);
          weak.unsubscribe();
        },
      );
    }
  });

  describe("prewarming", () => {
    for (const strategy of ["forward", "backward"] as const) {
      scenarioTest(
        `${strategy} releases a removed prewarm relay before any emit`,
        async ({ createScenario }) => {
          const { rxNostr, server } = createScenario();

          using destinations = new RxRelays([a, b]);
          using source = new RxReq();
          const inspector = new SubscriptionInspector<EventPacket>();
          const query = rxNostr[strategy](destinations, source, { defer: false }).subscribe(
            inspector,
          );

          for (const socket of server.connections) {
            socket.open();
          }

          await settleProtocol();
          destinations.remove(a);
          await settleProtocol();
          expect(server.sockets.latestFor(a).isCloseRequested).toBe(true);
          expect(server.sockets.latestFor(b).isCloseRequested).toBe(false);
          expect([...server.connections].every((socket) => socket.inbox.length === 0)).toBe(true);
          query.unsubscribe();
        },
      );
    }
  });

  describe("linger", () => {
    scenarioTest.for([
      "eose",
      "closed",
      "timeout",
      "unsubscribe",
      "remove",
      "source-dispose",
      "error",
    ] as const)(
      "preserves linger after %s and closes exactly at its deadline",
      async (ending, { createScenario }) => {
        const { rxNostr, server } = createScenario();

        using request = new RxReq();
        using destinations = new RxRelays([relay]);
        const inspector = new SubscriptionInspector<EventPacket>();

        const subscription = rxNostr
          .backward(destinations, ending === "source-dispose" ? request : [{}], {
            linger: 100,
            timeout: ending === "timeout" ? 10 : Infinity,
          })
          .subscribe(inspector);

        if (ending === "source-dispose") {
          request.emit([{}]);
        }

        const socket = server.sockets.latest;

        if (ending === "error") {
          socket.send = () => {
            throw new Error("send failed");
          };
        }

        socket.open();
        await settleProtocol();
        const id = ending === "error" ? undefined : (await socket.inbox.waitNext("REQ"))[1];

        if (ending === "eose" || ending === "source-dispose") {
          socket.message(["EOSE", id!]);
        }
        if (ending === "closed") {
          socket.message(["CLOSED", id!, "blocked"]);
        }
        if (ending === "timeout") {
          await vi.advanceTimersByTimeAsync(10);
        }
        if (ending === "unsubscribe") {
          subscription.unsubscribe();
        }
        if (ending === "remove") {
          destinations.clear();
        }
        if (ending === "source-dispose") {
          request.dispose();
        }

        await settleProtocol();

        expect(subscription.closed).toBe(true);
        expect(socket.isCloseRequested).toBe(false);
        await vi.advanceTimersByTimeAsync(99);
        expect(socket.isCloseRequested).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(socket.isCloseRequested).toBe(true);

        if (["unsubscribe", "remove", "timeout"].includes(ending)) {
          await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", id]);
          expect(socket.inbox.length).toBe(2);
        } else {
          expect(socket.inbox.length).toBe(ending === "error" ? 0 : 1);
        }
      },
    );

    scenarioTest(
      "reuses lingering demand without an old timer closing a newer query",
      async ({ createScenario }) => {
        const { rxNostr, server } = createScenario();
        const firstInspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(relay, [{}], { linger: 100 }).subscribe(firstInspector);
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();
        socket.message(["EOSE", (await socket.inbox.waitNext("REQ"))[1]]);
        await vi.advanceTimersByTimeAsync(50);

        const secondInspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(relay, [{}], { linger: 200 }).subscribe(secondInspector);
        await settleProtocol();
        const second = await socket.inbox.waitNext("REQ");

        await vi.advanceTimersByTimeAsync(50);
        expect(server.connections).toHaveLength(1);
        expect(socket.isCloseRequested).toBe(false);
        socket.message(["EOSE", second[1]]);
        await vi.advanceTimersByTimeAsync(199);
        expect(socket.isCloseRequested).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(socket.isCloseRequested).toBe(true);
      },
    );

    scenarioTest(
      "keeps independent packet linger deadlines after the source and query finish",
      async ({ createScenario }) => {
        const { rxNostr, server } = createScenario();

        using source = new RxReq();
        const inspector = new SubscriptionInspector<EventPacket>();

        rxNostr.backward(relay, source, { linger: 500 }).subscribe(inspector);
        source.emit([{}], { linger: 100 });
        source.emit([{}], { linger: 200 });
        source.dispose();
        const socket = server.sockets.latest;

        socket.open();
        await settleProtocol();

        for (let index = 0; index < 2; index++) {
          const req = await socket.inbox.waitNext("REQ");

          socket.message(["EOSE", req[1]]);
        }

        await settleProtocol();
        expect(inspector.completed).toBe(true);
        await vi.advanceTimersByTimeAsync(100);
        expect(socket.isCloseRequested).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(socket.isCloseRequested).toBe(true);
      },
    );
  });
});
