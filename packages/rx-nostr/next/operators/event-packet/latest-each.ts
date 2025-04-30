import {
  groupBy,
  map,
  mergeAll,
  pipe,
  type MonoTypeOperatorFunction,
} from "rxjs";
import type { EventPacket } from "../../packets/index.ts";
import { latest } from "./latest.ts";

/**
 * For each key, only the latest events are allowed to pass.
 */
export function latestEach<P extends EventPacket, K>(
  key: (packet: P) => K,
): MonoTypeOperatorFunction<P> {
  return pipe(groupBy(key), map(pipe(latest())), mergeAll());
}
