import Nostr from "nostr-typedef";
import {
  catchError,
  distinct,
  distinctUntilChanged,
  EMPTY,
  filter,
  groupBy,
  map,
  mergeAll,
  mergeMap,
  type MonoTypeOperatorFunction,
  type ObservableInput,
  of,
  type OperatorFunction,
  pipe,
  scan,
  timeout,
  TimeoutError,
} from "rxjs";

import { evalFilters } from "./helper.js";
import { compareEvents, verify as _verify } from "./nostr/event.js";
import { isFiltered, MatchFilterOptions } from "./nostr/filter.js";
import { EventPacket, LazyFilter, MessagePacket, ReqPacket } from "./packet.js";
import { defineDefaultOptions } from "./util.js";

// --------------------- //
// EventPacket operators //
// --------------------- //

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
      compareEvents(acc.event, packet.event) < 0 ? packet : acc
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
export function filterKind<K extends number>(
  kind: K
): MonoTypeOperatorFunction<EventPacket> {
  return filter<EventPacket>(({ event }) => event.kind === kind);
}

/**
 * Filter events based on a REQ filter object.
 */
export function filterBy(
  filters: LazyFilter | LazyFilter[],
  options?: MatchFilterOptions & FilterByOptions
): MonoTypeOperatorFunction<EventPacket> {
  const { not } = makeFilterByOptions(options);
  const evaledFilter = evalFilters(filters);
  return filter(({ event }) => {
    const match = isFiltered(event, evaledFilter, options);
    return not ? !match : match;
  });
}

/**
 * Accumulate latest events in order of new arrival (based on `created_at`).
 */
export function timeline(
  limit?: number
): OperatorFunction<EventPacket, EventPacket[]> {
  return scan<EventPacket, EventPacket[]>((acc, packet) => {
    const next = [...acc, packet].sort(
      (a, b) => -1 * compareEvents(a.event, b.event)
    );
    if (limit !== undefined) {
      next.splice(limit);
    }
    return next;
  }, []);
}

// ----------------------- //
// MessagePacket operators //
// ----------------------- //

export function filterType<T extends Nostr.ToClientMessage.Type>(
  type: T
): OperatorFunction<
  MessagePacket,
  MessagePacket<Nostr.ToClientMessage.Message<T>>
> {
  return filter(
    (packet): packet is MessagePacket<Nostr.ToClientMessage.Message<T>> =>
      packet.message[0] === type
  );
}

// ------------------- //
// ReqPacket operators //
// ------------------- //

/**
 * Map REQ packets into a single REQ packet.
 *
 * It is useful to reduce REQ requests in a time interval.
 */
export function batch(
  /** Function used for merge REQ filters. Default behavior is simple concatenation. */
  mergeFilter?: MergeFilter
): OperatorFunction<ReqPacket[], ReqPacket> {
  return map((f) =>
    f.reduce((acc, v) => {
      if (acc === null) {
        return v;
      }
      if (v === null) {
        return acc;
      }
      return (mergeFilter ?? defaultMergeFilter)(acc, v);
    }, null)
  );
}

/**
 * Chunk a REQ packet into multiple REQ packets.
 *
 * It is useful to avoid to send large REQ filter.
 */
export function chunk(
  predicate: (f: LazyFilter[]) => boolean,
  toChunk: (f: LazyFilter[]) => LazyFilter[][]
): MonoTypeOperatorFunction<ReqPacket> {
  return mergeMap((f) =>
    f !== null && predicate(f) ? of(...toChunk(f)) : of(f)
  );
}

// ----------------- //
// General operators //
// ----------------- //

/**
 * Almost RxJS's `timeout`, but won't throw.
 */
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

// ----------- //
// Other stuff //
// ----------- //

export type MergeFilter = (a: LazyFilter[], b: LazyFilter[]) => LazyFilter[];

function defaultMergeFilter(a: LazyFilter[], b: LazyFilter[]): LazyFilter[] {
  return [...a, ...b];
}

export interface FilterByOptions {
  not: boolean;
}
const makeFilterByOptions = defineDefaultOptions<FilterByOptions>({
  not: false,
});
