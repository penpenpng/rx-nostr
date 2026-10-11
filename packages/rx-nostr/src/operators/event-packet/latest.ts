import { distinctUntilChanged, pipe, scan, type MonoTypeOperatorFunction } from "rxjs";

import { compareEvents } from "../../libs/index.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Pass events that are newer by timestamp, breaking ties in favor of the smaller ID.
 */
export function latest<P extends EventPacket>(): MonoTypeOperatorFunction<P> {
  return pipe(
    scan((acc, packet) => (compareEvents(acc.event, packet.event) < 0 ? packet : acc)),
    distinctUntilChanged(
      (a, b) => a === b,
      ({ event }) => event.id,
    ),
  );
}
