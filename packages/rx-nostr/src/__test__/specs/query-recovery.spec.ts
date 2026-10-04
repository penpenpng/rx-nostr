import { RelayDirectory, RxReq, RxRelays } from "rx-nostr";
import { describe, expect, vi } from "vitest";

import { createDeferred, Faker } from "../helper/index.ts";
import { queryTest as test, settleQuery } from "../helper/query-lifecycle-scenario.ts";

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
    const query = rxNostr.backward(a, source).subscribe();
    source.emit([{ kinds: [1] }]);
    source.emit([{ kinds: [2] }]);
    source.emit([{ kinds: [3] }]);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    expect(socket.sentOfType("REQ")).toHaveLength(1);

    query.unsubscribe();
    await settleQuery();
    expect(socket.sentOfType("REQ")).toHaveLength(1);
    expect(socket.sentOfType("CLOSE")).toHaveLength(1);
  });

  test("replaces queued forward work without sending superseded filters", async ({
    createScenario,
  }) => {
    const directory = new RelayDirectory();
    directory.setNip11(a, { limitation: { max_subscriptions: 1 } });
    const { rxNostr, server } = createScenario({ relayDirectory: directory });
    using source = new RxReq();
    const blocker = rxNostr.backward(a, [{}]).subscribe();
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    const blockerId = socket.latestSent("REQ")[1];
    const query = rxNostr.forward(a, source).subscribe();
    source.emit([{ kinds: [1] }]);
    source.emit([{ kinds: [2] }]);
    await settleQuery();
    expect(socket.sentOfType("REQ")).toHaveLength(1);
    expect(socket.sentOfType("CLOSE")).toHaveLength(0);

    socket.message(["EOSE", blockerId]);
    await settleQuery();
    expect(socket.sentOfType("REQ").map((message) => message[2])).toEqual([{}, { kinds: [2] }]);
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
    const blocker = rxNostr.backward(a, [{}]).subscribe();
    const complete = vi.fn();
    const next = vi.fn();
    rxNostr.backward(destinations, [{}]).subscribe({ next, complete });
    for (const socket of server.connections) socket.open();
    await settleQuery();
    destinations.remove(a);
    const first = server.sockets.latestFor(a);
    const second = server.sockets.latestFor(b);
    first.message(["EOSE", first.latestSent("REQ")[1]]);
    second.message(["EVENT", second.latestSent("REQ")[1], Faker.event()]);
    second.message(["EOSE", second.latestSent("REQ")[1]]);
    await settleQuery();
    expect(first.sentOfType("REQ")).toHaveLength(1);
    expect(first.sentOfType("CLOSE")).toHaveLength(0);
    expect(next).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
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
      const query = rxNostr.forward(destinations, source).subscribe();
      source.emit([{ kinds: [1] }]);
      server.sockets.latest.open();
      await settleQuery();
      server.sockets.latest.peerClose(1006, "offline");
      await settleQuery();
      if (change === "replace") source.emit([{ kinds: [2] }]);
      else destinations.clear();
      await vi.advanceTimersByTimeAsync(100);
      const recovered = server.sockets.latest;
      expect(server.connections).toHaveLength(2);
      recovered.open();
      await settleQuery();
      expect(recovered.sentOfType("REQ").map((message) => message[2])).toEqual(
        change === "replace" ? [{ kinds: [2] }] : [],
      );
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
    const first = rxNostr.backward(a, [{ kinds: [1] }]).subscribe();
    const complete = vi.fn();
    rxNostr.backward(a, [{ kinds: [2] }]).subscribe({ complete });
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    socket.message(["AUTH", "challenge"]);
    for (const req of socket.sentOfType("REQ"))
      socket.message(["CLOSED", req[1], "auth-required: login"]);
    await settleQuery();
    expect(challenge).toHaveBeenCalledOnce();

    first.unsubscribe();
    const signed = Faker.authEvent({ id: "shared-auth" });
    auth.resolve(signed);
    await settleQuery();
    expect(socket.sentOfType("AUTH")).toEqual([["AUTH", signed]]);
    socket.message(["OK", signed.id, true, "authenticated"]);
    await settleQuery();
    expect(socket.sentOfType("REQ").map((req) => req[2])).toEqual([
      { kinds: [1] },
      { kinds: [2] },
      { kinds: [2] },
    ]);
    socket.message(["EOSE", socket.latestSent("REQ")[1]]);
    await settleQuery();
    expect(complete).toHaveBeenCalledOnce();
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
      } else rxNostr.backward(a, [{}]).subscribe();
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      if (phase !== "event-signing") {
        socket.message(["AUTH", "challenge"]);
        socket.message(["CLOSED", socket.latestSent("REQ")[1], "auth-required: login"]);
        await settleQuery();
      }
      const sent = [...socket.sent];
      rxNostr.dispose();
      signing.resolve(signed);
      socket.message(["OK", signed.id, true, "late"]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socket.sent).toEqual(sent);
      expect(socket.closeRequests).toHaveLength(1);
      expect(server.connections).toHaveLength(1);
      socket.acknowledgeClose();
      await settleQuery();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
