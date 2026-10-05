import "disposablestack/auto";
import { filter } from "rxjs";
import { expect, test } from "vitest";

import { SubscriptionInspector } from "../__test__/helper/index.ts";
import type { ReqPacket } from "../packets/index.ts";
import { RxReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxReq();
  const observable = rxq.asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.emit({ kinds: [0] });

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxReq();
  const observable = rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.emit({ kinds: [0] });
  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  rxq.emit({ kinds: [1] });
  rxq.emit({ kinds: [2] });

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});

test("Extended RxReq emits a filter", async () => {
  class RxCustomReq extends RxReq {
    fetchByKind(kind: number) {
      this.emit({ kinds: [kind] });
    }
  }

  const rxq = new RxCustomReq();
  const observable = rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable();
  const inspector = new SubscriptionInspector<ReqPacket>();

  observable.subscribe(inspector);

  rxq.fetchByKind(0);
  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await expect(inspector.waitNext()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});
