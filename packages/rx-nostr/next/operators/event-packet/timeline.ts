import { scan, type OperatorFunction } from "rxjs";
import { compareEvents } from "../../libs/nostr/event.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Accumulate latest events in order of new arrival (based on `created_at`).
 */
export function timeline<P extends EventPacket>(limit?: number): OperatorFunction<P, P[]> {
  return scan<P, P[]>((acc, packet) => {
    const next = [...acc, packet].sort((a, b) => -1 * compareEvents(a.event, b.event));
    if (limit !== undefined) {
      next.splice(limit);
    }
    return next;
  }, []);
}
