import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { xor } from "../../libs/xor.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Only events with given kinds are allowed to pass.
 */
export function filterByKinds<P extends EventPacket>(
  kinds: number[],
  options?: { not?: boolean },
): MonoTypeOperatorFunction<P> {
  return filter(({ event }) => xor(kinds.includes(event.kind), options?.not ?? false));
}
