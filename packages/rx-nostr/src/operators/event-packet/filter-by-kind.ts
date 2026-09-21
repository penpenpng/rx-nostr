import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { xor } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Only events with given kind are allowed to pass.
 */
export function filterByKind<P extends EventPacket>(
  kind: number,
  options?: { not?: boolean },
): MonoTypeOperatorFunction<P> {
  return filter(({ event }) => xor(event.kind === kind, options?.not ?? false));
}
