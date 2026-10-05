import { scan, type OperatorFunction } from "rxjs";

import { compareEvents } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Accumulate events newest first; smaller IDs lead at the same timestamp.
 */
export function timeline<P extends EventPacket>(limit?: number): OperatorFunction<P, P[]> {
  return scan<P, P[]>((acc, packet) => {
    const next = [...acc, packet].toSorted((a, b) => -1 * compareEvents(a.event, b.event));

    if (limit !== undefined) {
      next.splice(limit);
    }

    return next;
  }, []);
}
