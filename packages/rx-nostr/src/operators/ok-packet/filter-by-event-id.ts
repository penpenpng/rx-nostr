import { filter, type MonoTypeOperatorFunction } from "rxjs";
import { xor } from "../../libs/index.ts";
import type { OkPacket } from "../../packets/packets.interface.ts";

/**
 * Only events with given kind are allowed to pass.
 */
export function filterByEventId<P extends OkPacket>(
  eventId: string,
  options?: { not?: boolean },
): MonoTypeOperatorFunction<P> {
  return filter((p) => xor(p.eventId === eventId, options?.not ?? false));
}
