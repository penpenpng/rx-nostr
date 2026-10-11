import { expect, expectTypeOf, test } from "vitest";
import "disposablestack/auto";

import { SubscriptionInspector } from "../__test__/helper/index.ts";
import { RxNostrAlreadyDisposedError } from "../libs/error.ts";
import type { RelayUrl } from "../libs/index.ts";
import { RelayUrls } from "./relay-urls.ts";
import { RxRelays } from "./rx-relays.ts";

test("RxRelays emits a relay URL", async () => {
  const rxr = new RxRelays();

  const relay1 = "wss://relay1.example.com";

  rxr.append(relay1);

  const observable = rxr.asObservable();
  const inspector = new SubscriptionInspector<Set<RelayUrl>>();

  observable.subscribe(inspector);

  await expect(inspector.waitNext()).resolves.toEqual(new Set([relay1]));
});

test("RxRelays gives direct and observable subscribers independent Sets", () => {
  const first = "wss://first.example.com";
  const second = "wss://second.example.com";
  const injected = "wss://injected.example.com";
  const relays = new RxRelays([first]);
  const direct: Set<RelayUrl>[] = [];
  const observable: Set<RelayUrl>[] = [];

  relays.subscribe((value) => {
    direct.push(value);
    value.clear();
    value.add(injected);
  });
  relays.asObservable().subscribe((value) => observable.push(value));

  expect(observable).toEqual([new Set([first])]);
  expect(relays.toArray()).toEqual([first]);

  relays.append(second);

  expect(observable).toEqual([new Set([first]), new Set([first, second])]);
  expect(relays.toArray()).toEqual([first, second]);

  const replayed: Set<RelayUrl>[] = [];

  relays.asObservable().subscribe((value) => replayed.push(value));
  expect(replayed).toEqual([new Set([first, second])]);
  expect(direct).toHaveLength(2);
  relays.dispose();
});

test("RxRelays.observable gives iterable subscribers independent Sets", () => {
  const relay = "wss://relay.example.com";
  const source = RxRelays.observable([relay]);

  source.subscribe((value) => value.clear());

  let second: Set<RelayUrl> | undefined;

  source.subscribe((value) => {
    second = value;
  });
  expect(second).toEqual(new Set([relay]));
});

test(RxRelays.union.name, async () => {
  const rxr1 = new RxRelays();
  const rxr2 = new RxRelays();
  const rxr = RxRelays.union(rxr1, rxr2);

  const relay1 = "wss://relay1.example.com";
  const relay2 = "wss://relay2.example.com";

  rxr1.append(relay1);
  rxr2.append(relay2);

  const observable = rxr.asObservable();
  const inspector = new SubscriptionInspector<Set<RelayUrl>>();

  observable.subscribe(inspector);

  await expect(inspector.waitNext()).resolves.toEqual(new Set([relay1, relay2]));

  const relay3 = "wss://relay3.example.com";

  rxr1.append(relay3);
  await expect(inspector.waitNext()).resolves.toEqual(new Set([relay1, relay2, relay3]));

  rxr2.dispose();
  await expect(inspector.waitNext()).resolves.toEqual(new Set([relay1, relay3]));
});

test("RxRelays.intersection follows common relays as sources change", () => {
  const first = new RxRelays(["wss://shared.example.com", "wss://first.example.com"]);
  const second = new RxRelays(["wss://shared.example.com", "wss://second.example.com"]);
  const common = RxRelays.intersection(first, second);

  expect(common.toArray()).toEqual(["wss://shared.example.com"]);
  first.remove("wss://shared.example.com");
  expect(common.toArray()).toEqual([]);
  second.append("wss://first.example.com");
  expect(common.toArray()).toEqual(["wss://first.example.com"]);

  common.dispose();
  first.dispose();
  second.dispose();
});

test("rejects every mutation after disposal without changing the snapshot", () => {
  const relays = new RxRelays(["wss://original.example"]);

  relays.dispose();

  for (const mutate of [
    () => relays.replace("wss://other.example"),
    () => relays.append("wss://other.example"),
    () => relays.remove("wss://original.example"),
    () => relays.clear(),
  ]) {
    expect(mutate).toThrow(RxNostrAlreadyDisposedError);
  }

  expect(relays.toArray()).toEqual(["wss://original.example"]);
  expect(() => relays.dispose()).not.toThrow();
});

test("rejects one-shot relay inputs without consuming them", () => {
  const input = ["wss://relay.example"].values();

  for (const convert of [
    RxRelays.from,
    RelayUrls.toArray,
    RelayUrls.toRelaySet,
    RxRelays.observable,
  ]) {
    // @ts-expect-error Iterator is intentionally outside RelayInput.
    expect(() => convert(input)).toThrow(TypeError);
  }

  // @ts-expect-error Iterator is intentionally outside RelayInput.
  expect(() => new RxRelays(input)).toThrow(TypeError);
  expect(input.next().value).toBe("wss://relay.example");
});

test("replace normalizes URLs and toArray returns detached snapshots", () => {
  using relays = new RxRelays("wss://old.example");
  const snapshots: Set<RelayUrl>[] = [];

  relays.subscribe((urls) => snapshots.push(urls));
  relays.replace("wss://new.example/", "invalid", "wss://new.example");
  const snapshot = relays.toArray();

  snapshot.length = 0;

  expect(relays.toArray()).toEqual(["wss://new.example"]);
  expect(snapshots).toEqual([new Set(["wss://old.example"]), new Set(["wss://new.example"])]);
  expect(relays).not.toHaveProperty("get");
  expect(relays).not.toHaveProperty("set");
  expect(RxRelays).not.toHaveProperty("set");
  expect(RxRelays).not.toHaveProperty("array");
});

test("all factories return readonly relays at runtime and in their types", () => {
  using source = new RxRelays("wss://source.example");

  for (const derived of [
    RxRelays.union(source),
    RxRelays.intersection(source),
    RxRelays.difference(source, source),
    RxRelays.from(source),
    RxRelays.from(["wss://fixed.example"]),
    RxRelays.from(null),
    RxRelays.empty(),
    RxRelays.union(),
    RxRelays.intersection(),
  ]) {
    for (const method of ["append", "remove", "clear", "replace"]) {
      expect(derived).not.toHaveProperty(method);
    }

    expectTypeOf(derived).not.toHaveProperty("append");
    expectTypeOf(derived).not.toHaveProperty("remove");
    expectTypeOf(derived).not.toHaveProperty("clear");
    expectTypeOf(derived).not.toHaveProperty("replace");
    derived.dispose();
  }
});

test("nested readonly derivations follow updates and dispose independently", () => {
  using source = new RxRelays(["wss://one.example", "wss://two.example"]);
  using excluded = new RxRelays("wss://two.example");
  using difference = RxRelays.difference(source, excluded);
  using derived = RxRelays.from(difference);
  const snapshots: Set<RelayUrl>[] = [];

  RxRelays.observable(derived).subscribe((urls) => snapshots.push(urls));
  expect(derived.toArray()).toEqual(["wss://one.example"]);
  excluded.replace("wss://one.example");
  expect(derived.toArray()).toEqual(["wss://two.example"]);
  excluded.dispose();
  expect(derived.toArray()).toEqual(["wss://one.example", "wss://two.example"]);
  derived.dispose();
  source.clear();
  expect(difference.size).toBe(0);
  expect(derived.toArray()).toEqual(["wss://one.example", "wss://two.example"]);
  expect(snapshots).toHaveLength(3);
  expect(source.disposed).toBe(false);
});
