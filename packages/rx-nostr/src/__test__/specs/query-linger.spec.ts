import { RxRelays, RxReq } from "rx-nostr";
import { describe, expect, vi } from "vitest";

import type { EventPacket } from "../../packets/packets.interface.ts";
import { settleQuery, queryTest as test } from "../helper/query-lifecycle-scenario.ts";
import { SubscriptionInspector } from "../helper/subscription-inspector.ts";

const relay = "wss://linger.example.com";

describe("backward demand after query finalization", () => {
  test.for([
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
      if (ending === "source-dispose") request.emit([{}]);
      const socket = server.sockets.latest;
      if (ending === "error")
        socket.send = () => {
          throw new Error("send failed");
        };
      socket.open();
      await settleQuery();
      const id = socket.sentOfType("REQ")[0]?.[1];

      if (ending === "eose" || ending === "source-dispose") socket.message(["EOSE", id!]);
      if (ending === "closed") socket.message(["CLOSED", id!, "blocked"]);
      if (ending === "timeout") await vi.advanceTimersByTimeAsync(10);
      if (ending === "unsubscribe") subscription.unsubscribe();
      if (ending === "remove") destinations.clear();
      if (ending === "source-dispose") request.dispose();
      await settleQuery();

      expect(subscription.closed).toBe(true);
      expect(socket.closeRequests).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(99);
      expect(socket.closeRequests).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.closeRequests).toHaveLength(1);
      expect(socket.sentOfType("CLOSE")).toHaveLength(
        ["unsubscribe", "remove", "timeout"].includes(ending) ? 1 : 0,
      );
    },
  );

  test.for([100, Infinity])(
    "dispose ends finalized demand immediately with linger=%s",
    async (linger, { createScenario }) => {
      const { rxNostr, server } = createScenario();
      const inspector = new SubscriptionInspector<EventPacket>();
      rxNostr.backward(relay, [{}], { linger }).subscribe(inspector);
      const socket = server.sockets.latest;
      socket.open();
      await settleQuery();
      socket.message(["EOSE", socket.latestSent("REQ")[1]]);
      await settleQuery();
      expect(socket.closeRequests).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(linger === Infinity ? 60_000 : 50);
      expect(socket.closeRequests).toHaveLength(0);
      rxNostr.dispose();
      await settleQuery();
      expect(socket.closeRequests).toHaveLength(1);
      socket.acknowledgeClose();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(server.connections).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("reuses lingering demand without an old timer closing a newer query", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    const firstInspector = new SubscriptionInspector<EventPacket>();
    rxNostr.backward(relay, [{}], { linger: 100 }).subscribe(firstInspector);
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    socket.message(["EOSE", socket.latestSent("REQ")[1]]);
    await vi.advanceTimersByTimeAsync(50);

    const secondInspector = new SubscriptionInspector<EventPacket>();
    rxNostr.backward(relay, [{}], { linger: 200 }).subscribe(secondInspector);
    await settleQuery();
    const second = socket.latestSent("REQ");
    await vi.advanceTimersByTimeAsync(50);
    expect(server.connections).toHaveLength(1);
    expect(socket.closeRequests).toHaveLength(0);
    socket.message(["EOSE", second[1]]);
    await vi.advanceTimersByTimeAsync(199);
    expect(socket.closeRequests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closeRequests).toHaveLength(1);
  });

  test("keeps independent packet linger deadlines after the source and query finish", async ({
    createScenario,
  }) => {
    const { rxNostr, server } = createScenario();
    using source = new RxReq();
    const inspector = new SubscriptionInspector<EventPacket>();

    rxNostr.backward(relay, source, { linger: 500 }).subscribe(inspector);
    source.emit([{}], { linger: 100 });
    source.emit([{}], { linger: 200 });
    source.dispose();
    const socket = server.sockets.latest;
    socket.open();
    await settleQuery();
    for (const req of socket.sentOfType("REQ")) socket.message(["EOSE", req[1]]);
    await settleQuery();
    expect(inspector.completed).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.closeRequests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(socket.closeRequests).toHaveLength(1);
  });
});
