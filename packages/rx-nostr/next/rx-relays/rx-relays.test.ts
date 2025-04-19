import "disposablestack/auto";
import { expect, test } from "vitest";
import { subscribe } from "../__test__/helper/rxjs.ts";
import { RxRelays } from "./rx-relays.ts";

test("RxRelays emits a relay URL", async () => {
  const rxr = new RxRelays();

  const relay1 = "wss://relay1.example.com";
  rxr.append(relay1);

  const obs = subscribe<Set<string>>(rxr.asObservable());

  await expect(obs.pop()).resolves.toEqual(new Set([relay1]));
});

test(RxRelays.union.name, async () => {
  const rxr1 = new RxRelays();
  const rxr2 = new RxRelays();
  const rxr = RxRelays.union(rxr1, rxr2);

  const relay1 = "wss://relay1.example.com";
  const relay2 = "wss://relay2.example.com";
  rxr1.append(relay1);
  rxr2.append(relay2);

  const obs = subscribe<Set<string>>(rxr.asObservable());

  await expect(obs.pop()).resolves.toEqual(new Set([relay1, relay2]));

  const relay3 = "wss://relay3.example.com";
  rxr1.append(relay3);
  await expect(obs.pop()).resolves.toEqual(new Set([relay1, relay2, relay3]));

  rxr2.dispose();
  await expect(obs.pop()).resolves.toEqual(new Set([relay1, relay3]));
});
