import { RelayDirectory, RxRelays, RxReq } from "rx-nostr";
import { describe, expect, vi } from "vitest";

import type { EventPacket } from "../../packets/packets.interface.ts";
import { createDeferred, Faker } from "../helper/index.ts";
import { settleQuery, queryTest as test } from "../helper/query-lifecycle-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const a = "wss://a.example.com";
const b = "wss://b.example.com";

describe("destination changes during queued and recovering REQs", () => {
  test("unsubscribes active and queued backward requests without briefly sending cancelled work", async ({
    createScenario,
  }) => {
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
    await settleQuery();
    const req = await socket.inbox.waitNext("REQ");
    expect(req[2]).toEqual({ kinds: [1] });

    query.unsubscribe();
    await settleQuery();
    await expect(socket.inbox.waitNext()).resolves.toEqual(["CLOSE", req[1]]);
    expect(socket.inbox.length).toBe(2);
  });

  test("replaces queued forward work without sending superseded filters", async ({
    createScenario,
  }) => {
    const directory = new RelayDirectory();
    directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
    const { rxNostr, server } = createScenario({ relayDirectory: directory });
    using source = new RxReq();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const blocker = rxNostr.backward(a, [{}]).subscribe(firstInspector);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    const blockerId = (await socket.inbox.waitNext("REQ"))[1];
    const secondInspector = new SubscriptionInspector<EventPacket>();
    const query = rxNostr.forward(a, source).subscribe(secondInspector);
    source.emit([{ kinds: [1] }]);
    source.emit([{ kinds: [2] }]);
    await settleQuery();
    expect(socket.inbox.length).toBe(1);

    socket.message(["EOSE", blockerId]);
    await settleQuery();
    await expect(socket.inbox.waitNext()).resolves.toEqual([
      "REQ",
      expect.any(String),
      { kinds: [2] },
    ]);
    query.unsubscribe();
    blocker.unsubscribe();
  });

  test("removes queued work on one relay while the other relay keeps delivering", async ({
    createScenario,
  }) => {
    const directory = new RelayDirectory();
    directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
    const { rxNostr, server } = createScenario({ relayDirectory: directory });
    using destinations = new RxRelays([a, b]);
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const blocker = rxNostr.backward(a, [{}]).subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    rxNostr.backward(destinations, [{}]).subscribe(secondInspector);
    for (const socket of server.connections) socket.open();
    await settleQuery();
    destinations.remove(a);
    const first = server.sockets.latestFor(a);
    const second = server.sockets.latestFor(b);
    first.message(["EOSE", (await first.inbox.waitNext("REQ"))[1]]);
    const [, secondId] = await second.inbox.waitNext("REQ");
    second.message(["EVENT", secondId, Faker.event()]);
    second.message(["EOSE", secondId]);
    await settleQuery();
    expect(first.inbox.length).toBe(1);
    await expect(secondInspector.waitNext()).resolves.toMatchObject({ from: b });
    expect(secondInspector.completed).toBe(true);
    blocker.unsubscribe();
  });

  test.for(["replace", "remove"] as const)(
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
      await settleQuery();
      const initial = await socket.inbox.waitNext("REQ");
      expect(initial[2]).toEqual({ kinds: [1] });
      socket.peerClose(1006, "offline");
      await settleQuery();
      if (change === "replace") source.emit([{ kinds: [2] }]);
      else destinations.clear();
      await vi.advanceTimersByTimeAsync(100);
      const recovered = server.sockets.latest;
      expect(server.connections).toHaveLength(2);
      recovered.open();
      await settleQuery();
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

describe("shared AUTH and cancellation", () => {
  test("keeps shared authentication alive when only one waiting query unsubscribes", async ({
    createScenario,
  }) => {
    const auth = createDeferred<ReturnType<typeof Faker.authEvent>>();
    const challenge = vi.fn(() => auth.promise);
    const { rxNostr, server } = createScenario({ authenticator: { challenge } });
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const first = rxNostr.backward(a, [{ kinds: [1] }]).subscribe(firstInspector);
    const secondInspector = new SubscriptionInspector<EventPacket>();

    rxNostr.backward(a, [{ kinds: [2] }]).subscribe(secondInspector);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    socket.message(["AUTH", "challenge"]);
    for (const req of [await socket.inbox.waitNext("REQ"), await socket.inbox.waitNext("REQ")])
      socket.message(["CLOSED", req[1], "auth-required: login"]);
    await settleQuery();
    expect(challenge).toHaveBeenCalledOnce();

    first.unsubscribe();
    const signed = Faker.authEvent({ id: "shared-auth" });
    auth.resolve(signed);
    await settleQuery();
    await expect(socket.inbox.waitNext()).resolves.toEqual(["AUTH", signed]);
    socket.message(["OK", signed.id, true, "authenticated"]);
    await settleQuery();
    const retried = await socket.inbox.waitNext("REQ");
    expect(retried[2]).toEqual({ kinds: [2] });
    expect(socket.inbox.length).toBe(4);
    socket.message(["EOSE", retried[1]]);
    await settleQuery();
    expect(secondInspector.completed).toBe(true);
  });

  test.for(["auth-signing", "auth-ok", "event-signing"] as const)(
    "does not send delayed work after disposal during %s",
    async (phase, { createScenario }) => {
      const signing = createDeferred<ReturnType<typeof Faker.authEvent>>();
      const signed = Faker.authEvent({ id: "late-event" });
      const { rxNostr, server } = createScenario({
        authenticator: {
          challenge: () => (phase === "auth-ok" ? Promise.resolve(signed) : signing.promise),
        },
      });
      if (phase === "event-signing") {
        rxNostr.publish(
          a,
          { kind: 1, content: "" },
          {
            signer: {
              getPublicKey: async () => signed.pubkey,
              signEvent: async <K extends number>() =>
                (await signing.promise) as import("nostr-typedef").Event<K>,
            },
          },
        );
      } else {
        const inspector = new SubscriptionInspector<EventPacket>();
        rxNostr.backward(a, [{}]).subscribe(inspector);
      }
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      if (phase !== "event-signing") {
        socket.message(["AUTH", "challenge"]);
        socket.message(["CLOSED", (await socket.inbox.waitNext("REQ"))[1], "auth-required: login"]);
        await settleQuery();
      }
      const receivedCount = socket.inbox.length;
      rxNostr.dispose();
      signing.resolve(signed);
      socket.message(["OK", signed.id, true, "late"]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socket.inbox.length).toBe(receivedCount);
      expect(socket.isCloseRequested).toBe(true);
      expect(server.connections).toHaveLength(1);
      socket.acknowledgeClose();
      await settleQuery();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
