import {
  distinct,
  distinctUntilChanged,
  filter,
  ObservableInput,
  pipe,
  scan,
} from "rxjs";

import { verify as _verify } from "./nostr/event";
import { Nostr } from "./nostr/primitive";
import { EventPacket } from "./packet";

/**
 * Remove the events once seen.
 */
export function uniq(flushes?: ObservableInput<unknown>) {
  return distinct<EventPacket, string>(({ event }) => event.id, flushes);
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest() {
  return pipe(
    scan<EventPacket>((acc, packet) =>
      acc.event.created_at < packet.event.created_at ? packet : acc
    ),
    distinctUntilChanged(
      (a, b) => a === b,
      ({ event }) => event.id
    )
  );
}

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verify() {
  return filter<EventPacket>(({ event }) => _verify(event));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function filterKind<K extends Nostr.Kind>(kind: K) {
  return filter<EventPacket>(({ event }) => event.kind === kind);
}
