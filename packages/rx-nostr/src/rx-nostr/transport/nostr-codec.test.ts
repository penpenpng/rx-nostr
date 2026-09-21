import type * as Nostr from "nostr-typedef";
import { describe, expect, test } from "vitest";
import { Faker } from "../../__test__/helper/index.ts";
import {
  decodeRelayMessage,
  NostrMessageDecodeError,
  serializeNostrMessage,
} from "./nostr-codec.ts";

const relay = "wss://relay.example.com" as const;
const event = Faker.event({ id: "event-id" });

describe("Nostr relay codec", () => {
  test.each<[Nostr.ToClientMessage.Any, object]>([
    [["EVENT", "sub", event], { type: "EVENT", subId: "sub", event }],
    [["EOSE", "sub"], { type: "EOSE", subId: "sub" }],
    [
      ["OK", "event-id", false, "rate-limited: slow down"],
      {
        type: "OK",
        eventId: "event-id",
        ok: false,
        notice: "rate-limited: slow down",
        noticeType: "rate-limited",
      },
    ],
    [
      ["CLOSED", "sub", "auth-required: authenticate"],
      {
        type: "CLOSED",
        subId: "sub",
        notice: "auth-required: authenticate",
        noticeType: "auth-required",
      },
    ],
    [["NOTICE", "maintenance"], { type: "NOTICE", notice: "maintenance" }],
    [["AUTH", "challenge"], { type: "AUTH", challenge: "challenge" }],
    [
      ["COUNT", "sub", { count: 3 }],
      { type: "COUNT", subId: "sub", count: { count: 3 } },
    ],
  ])("decodes %s", (message, expected) => {
    expect(decodeRelayMessage(JSON.stringify(message), relay)).toMatchObject({
      from: relay,
      message,
      ...expected,
    });
  });

  test.each<[string | Uint8Array, NostrMessageDecodeError["code"]]>([
    [new Uint8Array([1]), "binary-message"],
    ["not json", "invalid-json"],
    [JSON.stringify(["EVENT", "sub"]), "invalid-tuple"],
    [JSON.stringify(["UNKNOWN"]), "invalid-tuple"],
  ])("rejects unsupported input without widening packets", (input, code) => {
    expect(() => decodeRelayMessage(input, relay)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  test("serializes a to-relay tuple as JSON", () => {
    const message: Nostr.ToRelayMessage.CLOSE = ["CLOSE", "sub"];
    expect(serializeNostrMessage(message)).toBe('["CLOSE","sub"]');
  });
});
