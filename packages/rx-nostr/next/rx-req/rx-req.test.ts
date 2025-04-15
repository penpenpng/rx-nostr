import "disposablestack/auto";
import { filter } from "rxjs";
import { expect, test } from "vitest";
import { subscribe } from "../__test__/helper/rxjs.ts";
import { RxBackwardReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = subscribe(rxq._packets$);

  rxq.emit({ kinds: [0] });

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = subscribe(rxq.pipe(filter((_, idx) => idx % 2 === 0))._packets$);

  rxq.emit({ kinds: [0] });
  rxq.emit({ kinds: [1] });
  rxq.emit({ kinds: [2] });

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});

test("Extended RxReq emits a filter", async () => {
  class RxCustomReq extends RxBackwardReq {
    fetchByKind(kind: number) {
      this.emit({ kinds: [kind] });
    }
  }

  const rxq = new RxCustomReq();
  const obs = subscribe(rxq.pipe(filter((_, idx) => idx % 2 === 0))._packets$);

  rxq.fetchByKind(0);
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});
