import "disposablestack/auto";
import { filter } from "rxjs";
import { test } from "vitest";
import { ObservableInspector } from "../__test__/helper/index.ts";
import { RxBackwardReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = new ObservableInspector(rxq.asObservable());
  obs.subscribe();

  rxq.emit({ kinds: [0] });

  await obs.expectNext({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = new ObservableInspector(
    rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable(),
  );
  obs.subscribe();

  rxq.emit({ kinds: [0] });
  rxq.emit({ kinds: [1] });
  rxq.emit({ kinds: [2] });

  await obs.expectNext({ filters: [{ kinds: [0] }] });
  await obs.expectNext({ filters: [{ kinds: [2] }] });
});

test("Extended RxReq emits a filter", async () => {
  class RxCustomReq extends RxBackwardReq {
    fetchByKind(kind: number) {
      this.emit({ kinds: [kind] });
    }
  }

  const rxq = new RxCustomReq();
  const obs = new ObservableInspector(
    rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable(),
  );
  obs.subscribe();

  rxq.fetchByKind(0);
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await obs.expectNext({ filters: [{ kinds: [0] }] });
  await obs.expectNext({ filters: [{ kinds: [2] }] });
});
