import { tap, toArray } from "rxjs";
import { expect, test } from "vitest";

import { createRxBackwardReq } from "../index.js";
import { spySubscription } from "./helper.js";

test("pipe()", async () => {
  const rxReq = createRxBackwardReq("sub");
  const piped = rxReq.pipe(tap());
  const spy = spySubscription();

  expect(piped.rxReqId).toBe("sub");
  expect(piped.strategy).toBe("backward");

  piped.getReqPacketObservable().pipe(toArray(), spy.tap()).subscribe();
  rxReq.emit({ limit: 1 });
  rxReq.emit({ limit: 2 });
  rxReq.emit({ limit: 3 });
  rxReq.over();
  await spy.willComplete();

  expect(spy.getLastValue()).toEqual([
    { filters: [{ limit: 1 }] },
    { filters: [{ limit: 2 }] },
    { filters: [{ limit: 3 }] },
  ]);
});
