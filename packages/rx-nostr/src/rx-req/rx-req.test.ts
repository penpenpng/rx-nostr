import "disposablestack/auto";
import { filter } from "rxjs";
import { expect, test } from "vitest";
import { ObservableInspector } from "../__test__/helper/index.ts";
import { RxBackwardReq, RxOneshotReq, RxStaticReq } from "./rx-req.ts";

test("RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = new ObservableInspector(rxq.asObservable());
  obs.subscribe();

  rxq.emit({ kinds: [0] });

  await obs.expectNext({ filters: [{ kinds: [0] }] });
});

test("Piped RxReq emits a filter", async () => {
  const rxq = new RxBackwardReq();
  const obs = new ObservableInspector(rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable());
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
  const obs = new ObservableInspector(rxq.pipe(filter((_, idx) => idx % 2 === 0)).asObservable());
  obs.subscribe();

  rxq.fetchByKind(0);
  rxq.fetchByKind(1);
  rxq.fetchByKind(2);

  await obs.expectNext({ filters: [{ kinds: [0] }] });
  await obs.expectNext({ filters: [{ kinds: [2] }] });
});

test("one-shot requests are backward and preserve traceTag", async () => {
  const rxq = new RxOneshotReq({ kinds: [1] }, { traceTag: "profile" });
  const obs = new ObservableInspector(rxq.asObservable());
  obs.subscribe();

  expect(rxq.strategy).toBe("backward");
  await obs.expectNext({
    filters: [{ kinds: [1] }],
    traceTag: "profile",
  });
});

test("static requests preserve their selected strategy", () => {
  expect(new RxStaticReq("forward", {}).strategy).toBe("forward");
  expect(new RxStaticReq("backward", {}).strategy).toBe("backward");
});
