import "disposablestack/auto";
import { expect, test } from "vitest";

import { SubscriptionInspector } from "../__test__/helper/index.ts";
import type { RelayUrl } from "../libs/index.ts";
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
  expect(relays.get()).toEqual(new Set([first]));

  relays.append(second);

  expect(observable).toEqual([new Set([first]), new Set([first, second])]);
  expect(relays.get()).toEqual(new Set([first, second]));

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
