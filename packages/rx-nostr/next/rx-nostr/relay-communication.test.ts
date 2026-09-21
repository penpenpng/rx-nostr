import { describe, expect, test, vi } from "vitest";
import { ControlledWebSocketServer, Faker } from "../__test__/helper/index.ts";
import { NoopRetryer } from "../connection-retryer/index.ts";
import { RelayCommunication } from "./relay-communication.ts";

describe("RelayCommunication transport integration", () => {
  test("sends REQ and sends protocol CLOSE before ending the local stream", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
      retryer: new NoopRetryer(),
    });
    const release = relay.hold();
    server.current.open();
    const events: string[] = [];
    const complete = vi.fn();

    const subscription = relay
      .vreq("forward", [{ kinds: [1], since: () => 10 }])
      .subscribe({
        next: (packet) => events.push(packet.event.id),
        complete,
      });
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    const req = JSON.parse(server.current.sent[0] as string) as [
      "REQ",
      string,
      object,
    ];
    expect(req[0]).toBe("REQ");
    expect(req[2]).toEqual({ kinds: [1], since: 10 });

    server.current.message(
      JSON.stringify(["EVENT", req[1], Faker.event({ id: "event" })]),
    );
    expect(events).toEqual(["event"]);

    subscription.unsubscribe();
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(2));
    expect(JSON.parse(server.current.sent[1] as string)).toEqual([
      "CLOSE",
      req[1],
    ]);
    expect(complete).not.toHaveBeenCalled();

    release();
    server.current.acknowledgeClose();
  });

  test("backward REQ completes on EOSE and does not expose its subId", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.current.open();
    const packets: object[] = [];
    const complete = vi.fn();

    relay.vreq("backward", [{}]).subscribe({
      next: (packet) => packets.push(packet),
      complete,
    });
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    const [, subId] = JSON.parse(server.current.sent[0] as string) as [
      "REQ",
      string,
    ];
    server.current.message(
      JSON.stringify(["EVENT", subId, Faker.event({ id: "event" })]),
    );
    server.current.message(JSON.stringify(["EOSE", subId]));

    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(packets).toEqual([
      {
        from: "wss://relay.example.com",
        type: "EVENT",
        event: Faker.event({ id: "event" }),
      },
    ]);
    expect(packets[0]).not.toHaveProperty("subId");
    expect(packets[0]).not.toHaveProperty("message");

    release();
    server.current.acknowledgeClose();
  });

  test("sends EVENT and maps the matching OK", async () => {
    const server = new ControlledWebSocketServer();
    const relay = new RelayCommunication("wss://relay.example.com", {
      WebSocket: server.WebSocket,
    });
    const release = relay.hold();
    server.current.open();
    const event = Faker.event({ id: "event" });
    const progress: object[] = [];

    relay.event(event).subscribe((packet) => progress.push(packet));
    await vi.waitFor(() => expect(server.current.sent).toHaveLength(1));
    expect(JSON.parse(server.current.sent[0] as string)).toEqual([
      "EVENT",
      event,
    ]);
    server.current.message('["OK","event",true,"saved"]');

    expect(progress).toEqual([
      { from: "wss://relay.example.com", state: "sent" },
      { from: "wss://relay.example.com", state: "ok", ok: true },
    ]);
    release();
    server.current.acknowledgeClose();
  });
});
