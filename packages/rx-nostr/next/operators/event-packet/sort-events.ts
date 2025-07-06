import { type MonoTypeOperatorFunction } from "rxjs";
import { compareEvents } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";
import { sort } from "../sort.ts";

export function sortEvents<P extends EventPacket>(
  bufferTime: number,
  compareFn?: (a: P, b: P) => number,
): MonoTypeOperatorFunction<P> {
  return sort(
    bufferTime,
    compareFn ?? ((a, b) => compareEvents(a.event, b.event)),
  );
}
