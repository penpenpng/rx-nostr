import "disposablestack/auto";
import { test } from "vitest";
import { ObservableInspector } from "../__test__/helper/index.ts";
import { RxRelays } from "./rx-relays.ts";

test("RxRelays emits a relay URL", async () => {
  const rxr = new RxRelays();

  const relay1 = "wss://relay1.example.com";
  rxr.append(relay1);

  const obs = new ObservableInspector(rxr.asObservable());
  obs.subscribe();

  await obs.expectNext(new Set([relay1]));
});

test(RxRelays.union.name, async () => {
  const rxr1 = new RxRelays();
  const rxr2 = new RxRelays();
  const rxr = RxRelays.union(rxr1, rxr2);

  const relay1 = "wss://relay1.example.com";
  const relay2 = "wss://relay2.example.com";
  rxr1.append(relay1);
  rxr2.append(relay2);

  const obs = new ObservableInspector(rxr.asObservable());
  obs.subscribe();

  await obs.expectNext(new Set([relay1, relay2]));

  const relay3 = "wss://relay3.example.com";
  rxr1.append(relay3);
  await obs.expectNext(new Set([relay1, relay2, relay3]));

  rxr2.dispose();
  await obs.expectNext(new Set([relay1, relay3]));
});
