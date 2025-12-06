import * as Nostr from "nostr-typedef";

/**
 * Filter object, but allows parameters since/until to be function.
 * If so, values will be evaluated just before submission.
 */
export type LazyFilter = Omit<Nostr.Filter, "since" | "until"> & {
  since?: number | (() => number);
  until?: number | (() => number);
};

/** @internal */
export type LazyREQ = ["REQ", string, ...LazyFilter[]];
