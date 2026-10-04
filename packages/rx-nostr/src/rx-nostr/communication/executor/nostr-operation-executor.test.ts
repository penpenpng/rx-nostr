import { describe, expect, test, vi } from "vitest";

import { ControlledWebSocketServer, Faker } from "../../../__test__/helper/index.ts";
import { SubscriptionInspector } from "../../../__test__/helper/subscription-inspector.ts";
import { normalizeRelayUrl } from "../../../libs/index.ts";
import type { EventPacket } from "../../../packets/packets.interface.ts";
import { RelayReqScheduler } from "../scheduler/index.ts";
import { NostrTransport } from "../transport/index.ts";
import {
  NostrOperationExecutor,
  type NostrOperationExecutorOptions,
} from "./nostr-operation-executor.ts";

function setup(options: NostrOperationExecutorOptions = {}) {
  const url = normalizeRelayUrl("wss://relay.example.com")!;
  const server = new ControlledWebSocketServer();
  const transport = new NostrTransport({ url, WebSocket: server.WebSocket });
  const session = new NostrOperationExecutor(url, transport, options);
  const scheduler = new RelayReqScheduler();
  void session.open();
  const socket = server.sockets.latest;
  socket.open();
  return { server, session, scheduler };
}

function dispose({ server, session, scheduler }: ReturnType<typeof setup>): void {
  scheduler.dispose();
  session.dispose();
  const socket = server.sockets.latest;
  socket.acknowledgeClose();
}

describe("NostrOperationExecutor", () => {
  test("merges planned REQs while the scheduler applies capacity to each plan", async () => {
    const harness = setup({
      vreqPlanner: (strategy, filters) =>
        filters.map((filter) => ({ strategy, filters: [filter] })),
    });
    harness.scheduler.setMaxSubscriptions(1);
    const inspector = new SubscriptionInspector<EventPacket>();

    harness.session
      .vreq("backward", [{ kinds: [1] }, { kinds: [2] }], harness.scheduler)
      .subscribe(inspector);

    const socket = harness.server.sockets.latest;
    const first = await socket.inbox.waitNext("REQ");
    expect(first[2]).toMatchObject({ kinds: [1] });
    expect(socket.inbox.length).toBe(1);
    socket.message(["EOSE", first[1]]);

    const second = await socket.inbox.waitNext("REQ");
    expect(second[1]).not.toBe(first[1]);
    expect(second[2]).toMatchObject({ kinds: [2] });
    socket.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(inspector.completed).toBe(true));

    dispose(harness);
  });

  test("releases an auth-required REQ slot and schedules its retry with a new subId", async () => {
    const harness = setup({ authenticator: { challenge: () => pendingAuthEvent } });
    harness.scheduler.setMaxSubscriptions(1);
    const authEvent = Faker.authEvent({
      id: "auth-event",
      relay: harness.session.url,
      challenge: "challenge",
    });
    let resolveAuthEvent!: (event: typeof authEvent) => void;
    const pendingAuthEvent = new Promise<typeof authEvent>((resolve) => {
      resolveAuthEvent = resolve;
    });
    const firstInspector = new SubscriptionInspector<EventPacket>();
    const secondInspector = new SubscriptionInspector<EventPacket>();

    harness.session.vreq("backward", [{ kinds: [1] }], harness.scheduler).subscribe(firstInspector);

    harness.session
      .vreq("backward", [{ kinds: [2] }], harness.scheduler)
      .subscribe(secondInspector);

    const socket = harness.server.sockets.latest;
    const first = await socket.inbox.waitNext("REQ");
    socket.message(["AUTH", "challenge"]);
    socket.message(["CLOSED", first[1], "auth-required: login"]);

    expect(socket.inbox.length).toBe(1);
    expect(firstInspector.completed).toBe(false);

    resolveAuthEvent(authEvent);
    expect(await socket.inbox.waitNext("AUTH")).toEqual(["AUTH", authEvent]);
    socket.message(["OK", "auth-event", true, "authenticated"]);
    const second = await socket.inbox.waitNext("REQ");
    expect(second[2]).toMatchObject({ kinds: [2] });

    socket.message(["EOSE", second[1]]);
    const retried = await socket.inbox.waitNext("REQ");
    expect(retried[1]).not.toBe(first[1]);
    expect(retried[2]).toMatchObject({ kinds: [1] });
    socket.message(["EOSE", retried[1]]);

    await vi.waitFor(() => expect(firstInspector.completed).toBe(true));
    expect(secondInspector.completed).toBe(true);
    dispose(harness);
  });

  test("cancels queued sibling plans before draining after a callback error", async () => {
    const harness = setup({
      vreqPlanner: (strategy, filters) =>
        filters.map((filter) => ({ strategy, filters: [filter] })),
    });
    harness.scheduler.setMaxSubscriptions(1);
    const cause = new Error("first plan failed");
    const inspector = new SubscriptionInspector<EventPacket>();

    harness.session
      .vreq(
        "backward",
        [
          {
            since: () => {
              throw cause;
            },
          },
          { kinds: [2] },
        ],
        harness.scheduler,
      )
      .subscribe(inspector);

    await expect(inspector.waitError()).resolves.toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    const socket = harness.server.sockets.latest;
    expect(socket.inbox.length).toBe(0);
    dispose(harness);
  });
});
