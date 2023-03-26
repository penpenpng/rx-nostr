import {
  distinct,
  distinctUntilChanged,
  filter,
  Observable,
  ObservableInput,
  partition,
  pipe,
  scan,
} from "rxjs";

import { RelayError, RelayMessageEvent, RelayReqMessageEvent } from "./relay";
import { Nostr } from "./nostr/primitive";
import { verify } from "./nostr/event";

/**
 * Separate the results of `observeReq()` into `RelayError` and the rest.
 */
export function extractRelayError<T extends RelayMessageEvent>(
  source: ObservableInput<T | RelayError>
): [Observable<RelayError>, Observable<T>] {
  return partition<T | RelayError, RelayError>(
    source,
    (event, _): event is RelayError => event.kind === "error"
  );
}

/**
 * Remove the events once seen.
 */
export function distinctEvent(flushes?: ObservableInput<unknown>) {
  return distinct<RelayReqMessageEvent, string>(
    (event) => getEvent(event).id,
    flushes
  );
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest() {
  return pipe(
    scan<RelayReqMessageEvent>((acc, event) =>
      getEvent(acc).created_at < getEvent(event).created_at ? event : acc
    ),
    distinctUntilChanged(
      (a, b) => a === b,
      (event) => event.message[2].id
    )
  );
}

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verifyEvent() {
  return filter<RelayReqMessageEvent>((event) => verify(getEvent(event)));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function kind<K extends Nostr.Kind>(kind: K) {
  return filter<RelayReqMessageEvent>((event) => getEvent(event).kind === kind);
}

function getEvent(ev: RelayReqMessageEvent) {
  return ev.message[2];
}
