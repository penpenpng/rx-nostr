import "disposablestack/auto";
import { expect, test } from "vitest";

import { RelaySet } from "../libs/relay-urls.ts";
import { RelayUrls } from "./relay-urls.ts";
import { RxRelays } from "./rx-relays.ts";

test("RelayUrls always returns RelaySet and array snapshots", () => {
  using source = new RxRelays("wss://relay.example/");
  using derived = RxRelays.union(source);

  for (const input of [
    undefined,
    null,
    [],
    "",
    "invalid",
    "wss://relay.example/",
    ["wss://relay.example/", "invalid", "wss://relay.example"],
    new Set(["wss://relay.example/"]),
    source,
    derived,
  ]) {
    const set = RelayUrls.toRelaySet(input);
    const array = RelayUrls.toArray(input);

    expect(set).toBeInstanceOf(RelaySet);
    expect([...set]).toEqual(array);
    expect(array).toEqual(
      input && input !== "invalid" && !(Array.isArray(input) && !input.length)
        ? ["wss://relay.example"]
        : [],
    );
    set.clear();

    array.length = 0;

    expect(source.toArray()).toEqual(["wss://relay.example"]);
  }
});
