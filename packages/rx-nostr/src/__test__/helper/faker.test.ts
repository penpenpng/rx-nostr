import { describe, expect, test } from "vitest";
import { Faker } from "./faker.ts";

describe("Faker", () => {
  test("builds events from focused overrides", () => {
    expect(Faker.event({ id: "event", kind: 1 })).toMatchObject({
      id: "event",
      kind: 1,
      tags: [],
      content: "",
    });
  });

  test("builds kind 22242 authentication events", () => {
    expect(
      Faker.authEvent({
        id: "auth-event",
        relay: "wss://relay.example.com",
        challenge: "challenge",
      }),
    ).toMatchObject({
      id: "auth-event",
      kind: 22242,
      tags: [
        ["relay", "wss://relay.example.com"],
        ["challenge", "challenge"],
      ],
    });
  });
});
