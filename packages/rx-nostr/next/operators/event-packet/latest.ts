import {
  distinctUntilChanged,
  pipe,
  scan,
  type MonoTypeOperatorFunction,
} from "rxjs";
import { compareEvents } from "../../libs/nostr/event.ts";
import type { EventPacket } from "../../packets/index.ts";

/**
 * Only the latest events are allowed to pass.
 */
export function latest<P extends EventPacket>(): MonoTypeOperatorFunction<P> {
  return pipe(
    scan((acc, packet) =>
      compareEvents(acc.event, packet.event) < 0 ? packet : acc,
    ),
    distinctUntilChanged(
      (a, b) => a === b,
      ({ event }) => event.id,
    ),
  );
}
