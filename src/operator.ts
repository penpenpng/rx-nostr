import {
  distinct,
  distinctUntilChanged,
  filter,
  map,
  ObservableInput,
  pipe,
  scan,
  tap,
} from "rxjs";

import { EventMessageNotification } from "./relay";
import { Nostr } from "./nostr/primitive";
import { verify as _verify } from "./nostr/event";
import { MonoFilterAccumulater } from "./filter";

/**
 * Remove the events once seen.
 */
export function uniq(flushes?: ObservableInput<unknown>) {
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
export function verify() {
  return filter<EventMessageNotification>((event) => _verify(getEvent(event)));
}

/**
 * Only events with given kind are allowed to pass.
 */
export function filterKind<K extends Nostr.Kind>(kind: K) {
  return filter<EventMessageNotification>(
    (event) => getEvent(event).kind === kind
  );
}

export function collect(tag: "e" | "p", acc: MonoFilterAccumulater) {
  return tap<EventMessageNotification>((event) => {
    const { tags } = getEvent(event);
    const vals = tags.filter(([t]) => t === tag).map(([, val]) => val);

    if (vals.length <= 0) {
      return;
    }

    if (tag === "e") {
      acc.set("ids", ...vals);
    } else if (tag === "p") {
      acc.set("kinds", Nostr.Kind.Metadata);
      acc.set("authors", ...vals);
    }
  });
}

export function pickEvent() {
  return map<EventMessageNotification, Nostr.Event>(getEvent);
}

function getEvent(ev: EventMessageNotification) {
  return ev.message[2];
}
