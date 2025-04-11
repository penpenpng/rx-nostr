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
  const obs = observe(rxq.pipe(filter(() => true)).packets$);

  rxq.emit({ kinds: [0] });

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});

test("Extended RxReq emits a filter", async () => {
  class RxCustomReq extends RxBackwardReq {
    fetchKind0() {
      this.emit({ kinds: [0] });
    }
  }

  const rxq = new RxCustomReq();
  const obs = observe(rxq.pipe(filter(() => true)).packets$);

  rxq.fetchKind0();

  await expect(obs.pop()).resolves.toEqual({ filters: [{ kinds: [0] }] });
});
