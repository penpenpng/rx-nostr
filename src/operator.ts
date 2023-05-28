import {
  catchError,
  distinct,
  distinctUntilChanged,
  EMPTY,
  filter,
  groupBy,
  map,
  mergeAll,
  MonoTypeOperatorFunction,
  ObservableInput,
  pipe,
  scan,
  timeout,
  TimeoutError,
} from "rxjs";

import { verify as _verify } from "./nostr/event";
import { Nostr } from "./nostr/primitive";
import { EventPacket } from "./packet";

/**
 * Remove the events once seen.
 */
export function uniq(
  flushes?: ObservableInput<unknown>
): MonoTypeOperatorFunction<EventPacket> {
  return distinct<EventPacket, string>(({ event }) => event.id, flushes);
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest(): MonoTypeOperatorFunction<EventPacket> {
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
 * For each key, only the latest events are allowed to pass.
 */
export function latestEach<K>(
  key: (packet: EventPacket) => K
): MonoTypeOperatorFunction<EventPacket> {
  return pipe(groupBy(key), map(pipe(latest())), mergeAll());
}

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verify(): MonoTypeOperatorFunction<EventPacket> {
  return filter<EventPacket>(({ event }) => _verify(event));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function filterKind<K extends Nostr.Kind>(
  kind: K
): MonoTypeOperatorFunction<EventPacket> {
  return filter<EventPacket>(({ event }) => event.kind === kind);
}

export function completeOnTimeout<T>(
  time: number
): MonoTypeOperatorFunction<T> {
  return pipe(
    timeout(time),
    catchError((error: unknown) => {
      if (error instanceof TimeoutError) {
        return EMPTY;
      } else {
        throw error;
      }
    })
  );
}
