import {
  distinct,
  distinctUntilChanged,
  filter,
  map,
  ObservableInput,
  pipe,
  scan,
} from "rxjs";

import { RelayNotification } from "./relay";
import { Nostr } from "./nostr/primitive";
import { verify } from "./nostr/event";

type EventNotification = RelayNotification.Message<Nostr.IncomingMessage.EVENT>;

/**
 * Remove the events once seen.
 */
export function distinctEvent(flushes?: ObservableInput<unknown>) {
  return distinct<EventNotification, string>(
    (event) => getEvent(event).id,
    flushes
  );
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest() {
  return pipe(
    scan<EventNotification>((acc, event) =>
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
  return filter<EventNotification>((event) => verify(getEvent(event)));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function kind<K extends Nostr.Kind>(kind: K) {
  return filter<EventNotification>((event) => getEvent(event).kind === kind);
}

export function pickMessage() {
  return map<EventNotification, Nostr.Event>(getEvent);
}

function getEvent(ev: EventNotification) {
  return ev.message[2];
}
