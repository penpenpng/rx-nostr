import {
  distinct,
  distinctUntilChanged,
  filter,
  map,
  ObservableInput,
  pipe,
  scan,
} from "rxjs";

import { EventMessageNotification } from "./relay";
import { Nostr } from "./nostr/primitive";
import { verify } from "./nostr/event";

/**
 * Remove the events once seen.
 */
export function distinctEvent(flushes?: ObservableInput<unknown>) {
  return distinct<EventMessageNotification, string>(
    (event) => getEvent(event).id,
    flushes
  );
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest() {
  return pipe(
    scan<EventMessageNotification>((acc, event) =>
      getEvent(acc).created_at < getEvent(event).created_at ? event : acc
    ),
    distinctUntilChanged(
      (a, b) => a === b,
      (event) => getEvent(event).id
    )
  );
}

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verifyEvent() {
  return filter<EventMessageNotification>((event) => verify(getEvent(event)));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function kind<K extends Nostr.Kind>(kind: K) {
  return filter<EventMessageNotification>(
    (event) => getEvent(event).kind === kind
  );
}

export function pickMessage() {
  return map<EventMessageNotification, Nostr.Event>(getEvent);
}

function getEvent(ev: EventMessageNotification) {
  return ev.message[2];
}
