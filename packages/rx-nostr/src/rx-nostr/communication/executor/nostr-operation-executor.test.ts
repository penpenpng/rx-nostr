import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, expectSent, Faker } from "../../../__test__/helper/index.ts";
import { normalizeRelayUrl } from "../../../libs/index.ts";
import {
  NostrOperationExecutor,
  type NostrOperationExecutorOptions,
} from "./nostr-operation-executor.ts";
import { RelayReqScheduler } from "../scheduler/index.ts";
import { NostrTransport } from "../transport/index.ts";

function setup(options: NostrOperationExecutorOptions = {}) {
  const url = normalizeRelayUrl("wss://relay.example.com")!;
  const server = new ControlledWebSocketServer();
  const transport = new NostrTransport({ url, WebSocket: server.WebSocket });
  const session = new NostrOperationExecutor(url, transport, options);
  const scheduler = new RelayReqScheduler();
  void session.open();
  server.sockets.latest.open();
  return { server, session, scheduler };
}

function dispose({ server, session, scheduler }: ReturnType<typeof setup>): void {
  scheduler.dispose();
  session.dispose();
  server.sockets.latest.acknowledgeClose();
}

describe("NostrOperationExecutor", () => {
  test("merges planned REQs while the scheduler applies capacity to each plan", async () => {
    const harness = setup({
      vreqPlanner: (strategy, filters) =>
        filters.map((filter) => ({ strategy, filters: [filter] })),
    });
    harness.scheduler.setMaxSubscriptions(1);
    const complete = vi.fn();

    harness.session
      .vreq("backward", [{ kinds: [1] }, { kinds: [2] }], harness.scheduler)
      .subscribe({ complete });

    const first = await expectSent(harness.server.sockets.latest, "REQ");
    expect(first[2]).toMatchObject({ kinds: [1] });
    expect(harness.server.sockets.latest.sentOfType("REQ")).toHaveLength(1);
    harness.server.sockets.latest.message(["EOSE", first[1]]);

    const second = await expectSent(harness.server.sockets.latest, "REQ", 2);
    expect(second[1]).not.toBe(first[1]);
    expect(second[2]).toMatchObject({ kinds: [2] });
    harness.server.sockets.latest.message(["EOSE", second[1]]);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

    dispose(harness);
  });

  test("releases an auth-required REQ slot and schedules its retry with a new subId", async () => {
    const harness = setup();
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
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();

    harness.session
      .vreq("backward", [{ kinds: [1] }], harness.scheduler, {
        authenticator: { challenge: () => pendingAuthEvent },
      })
      .subscribe({ complete: firstComplete });
    harness.session
      .vreq("backward", [{ kinds: [2] }], harness.scheduler)
      .subscribe({ complete: secondComplete });

    const first = await expectSent(harness.server.sockets.latest, "REQ");
    harness.server.sockets.latest.message(["AUTH", "challenge"]);
    harness.server.sockets.latest.message(["CLOSED", first[1], "auth-required: login"]);

    const second = await expectSent(harness.server.sockets.latest, "REQ", 2);
    expect(second[2]).toMatchObject({ kinds: [2] });
    expect(firstComplete).not.toHaveBeenCalled();

    resolveAuthEvent(authEvent);
    expect(await expectSent(harness.server.sockets.latest, "AUTH")).toEqual(["AUTH", authEvent]);
    harness.server.sockets.latest.message(["OK", "auth-event", true, "authenticated"]);
    await Promise.resolve();
    expect(harness.server.sockets.latest.sentOfType("REQ")).toHaveLength(2);

    harness.server.sockets.latest.message(["EOSE", second[1]]);
    const retried = await expectSent(harness.server.sockets.latest, "REQ", 3);
    expect(retried[1]).not.toBe(first[1]);
    expect(retried[2]).toMatchObject({ kinds: [1] });
    harness.server.sockets.latest.message(["EOSE", retried[1]]);

    await vi.waitFor(() => expect(firstComplete).toHaveBeenCalledOnce());
    expect(secondComplete).toHaveBeenCalledOnce();
    dispose(harness);
  });

  test("cancels queued sibling plans before draining after a callback error", async () => {
    const harness = setup({
      vreqPlanner: (strategy, filters) =>
        filters.map((filter) => ({ strategy, filters: [filter] })),
    });
    harness.scheduler.setMaxSubscriptions(1);
    const cause = new Error("first plan failed");
    let received: unknown;

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
      .subscribe({ error: (error) => (received = error) });

    await vi.waitFor(() => expect(received).toBeDefined());
    expect(received).toMatchObject({
      name: "RxNostrCallbackError",
      callback: "filter",
      cause,
    });
    expect(harness.server.sockets.latest.sent).toEqual([]);
    dispose(harness);
  });
});
