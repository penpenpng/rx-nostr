import {
  distinct,
  distinctUntilChanged,
  filter,
  map,
  ObservableInput,
  pipe,
  scan,
} from "rxjs";

import { extractEvent } from "./util";
import { EventMessageNotification } from "./type";
import { Nostr } from "./nostr/primitive";
import { verify as _verify } from "./nostr/event";

/**
 * Remove the events once seen.
 */
export function uniq(flushes?: ObservableInput<unknown>) {
  return distinct<EventMessageNotification, string>(
    (event) => extractEvent(event).id,
    flushes
  );
}

/**
 * Only the latest events are allowed to pass.
 */
export function latest() {
  return pipe(
    scan<EventMessageNotification>((acc, event) =>
      extractEvent(acc).created_at < extractEvent(event).created_at
        ? event
        : acc
    ),
    distinctUntilChanged(
      (a, b) => a === b,
      (event) => extractEvent(event).id
    )
  );
}

/**
 * Only events with a valid signature are allowed to pass.
 */
export function verify() {
  return filter<EventMessageNotification>((event) =>
    _verify(extractEvent(event))
  );
}

/**
 * Only events with given kind are allowed to pass.
 */
export function filterKind<K extends Nostr.Kind>(kind: K) {
  return filter<EventMessageNotification>(
    (event) => extractEvent(event).kind === kind
  );
}

export function pickEvent() {
  return map<EventMessageNotification, Nostr.Event>(extractEvent);
}
