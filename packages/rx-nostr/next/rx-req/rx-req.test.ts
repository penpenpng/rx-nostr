import { filter } from "rxjs";
import { expect, test } from "vitest";
import { observe } from "../__test__/helper/rxjs.ts";
import { RxBackwardReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = observe(rxq.packets$);

  rxq.emit({ kinds: [0] });

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = observe(rxq.pipe(filter((_, idx) => idx % 2 === 0)).packets$);

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
  const obs = observe(rxq.pipe(filter((_, idx) => idx % 2 === 0)).packets$);

  rxq.fetchByKind(0);
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [2] }] });
});
