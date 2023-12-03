import Nostr from "nostr-typedef";
import {
  catchError,
  delay,
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
  tap,
  timeout,
  TimeoutError,
} from "rxjs";

import { RxNostrLogicError } from "./error.js";
import { evalFilters } from "./lazy-filter.js";
import { compareEvents, verify as _verify } from "./nostr/event.js";
import { isFiltered, MatchFilterOptions } from "./nostr/filter.js";
import { EventPacket, LazyFilter, MessagePacket, ReqPacket } from "./packet.js";
import { defineDefault } from "./utils.js";

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
 * Create a customizable uniq operator.
 *
 * If `keyFn()` returns a non-null key, the key is stored in `Set`.
 * The operator filters packets with keys already stored.
 *
 * The `Set` returned in the second value of the tuple
 * can be manipulated externally or in optional event handlers.
 * For example, you can call `Set#clear()` to forget all keys.
 */
export function createUniq<T>(
  keyFn: (packet: EventPacket) => T | null,
  options?: CreateUniqOptions<T>
): [MonoTypeOperatorFunction<EventPacket>, Set<T>] {
  const cache = new Set<T>();

  return [
    filter((packet) => {
      const key = keyFn(packet);
      if (key === null) {
        return true;
      }

      if (cache.has(key)) {
        options?.onHit?.(packet, cache);
        return false;
      } else {
        cache.add(key);
        options?.onCache?.(packet, cache);
        return true;
      }
    }),
    cache,
  ];
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
export function filterByKind<K extends number>(
  kind: K
): MonoTypeOperatorFunction<EventPacket> {
  return filter<EventPacket>(({ event }) => event.kind === kind);
}
/** @deprecated Renamed. Use `filterByKind` instead. */
export const filterKind = filterByKind;

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

export function sortEvents(
  bufferTime: number,
  compareFn?: (a: EventPacket, b: EventPacket) => number
): MonoTypeOperatorFunction<EventPacket> {
  return sort(
    bufferTime,
    compareFn ?? ((a, b) => compareEvents(a.event, b.event))
  );
}

// ----------------------- //
// MessagePacket operators //
// ----------------------- //

export function filterByType<T extends Nostr.ToClientMessage.Type>(
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
/** @deprecated Renamed. Use `filterByType` instead. */
export const filterType = filterByKind;

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

/**
 * Buffer the received values for a specified time
 * and return the values in sorted order as possible.
 */
export function sort<T>(
  bufferTime: number,
  compareFn: (a: T, b: T) => number
): MonoTypeOperatorFunction<T> {
  const buffer: T[] = [];

  return pipe(
    tap((v) => {
      buffer.push(v);
      buffer.sort(compareFn);
    }),
    delay(bufferTime),
    map(() => {
      if (buffer.length <= 0) {
        throw new RxNostrLogicError();
      }
      // Non-null is valid because the length has been checked.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return buffer.shift()!;
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

export interface CreateUniqOptions<T> {
  onCache?: (packet: EventPacket, cache: Set<T>) => void;
  onHit?: (packet: EventPacket, cache: Set<T>) => void;
}

export interface FilterByOptions {
  not: boolean;
}
const makeFilterByOptions = defineDefault<FilterByOptions>({
  not: false,
});
