import type { Subscription } from "rxjs";
import { once, type RelayUrl } from "../libs/index.ts";
import {
  getRelayDirectoryReporter,
  type RelayDirectory,
} from "../relay-directory/relay-directory.ts";
import type { NostrTransportOptions } from "./transport/index.ts";

/** Connects relay-local transport and capacity state to the shared RelayDirectory. */
export class RelayDirectoryBridge implements Disposable {
  readonly transportHooks: Pick<
    NostrTransportOptions,
    "onConnectionOpened" | "onConnectionFailed" | "getConnectionHealth"
  >;
  readonly #subscription?: Subscription;

  constructor(
    url: RelayUrl,
    directory: RelayDirectory | undefined,
    onMaxSubscriptions: (value: number | undefined) => void,
  ) {
    if (!directory) {
      this.transportHooks = {};
      return;
    }
    const reporter = getRelayDirectoryReporter(directory);
    this.transportHooks = {
      onConnectionOpened: () => reporter.connectionOpened(url),
      onConnectionFailed: () => reporter.connectionFailed(url),
      getConnectionHealth: () => {
        const entry = directory.getOrCreate(url);
        return Object.freeze({
          consecutiveFailures: entry.consecutiveFailures,
          ...(entry.lastConnectedAt === undefined
            ? {}
            : { lastConnectedAt: entry.lastConnectedAt }),
          ...(entry.lastFailureAt === undefined ? {} : { lastFailureAt: entry.lastFailureAt }),
        });
      },
    };
    this.#subscription = directory.observe(url).subscribe({
      next: (entry) => onMaxSubscriptions(entry.maxSubscriptions),
      complete: () => onMaxSubscriptions(undefined),
    });
  }

  [Symbol.dispose] = once(() => this.#subscription?.unsubscribe());
  dispose = this[Symbol.dispose];
}
