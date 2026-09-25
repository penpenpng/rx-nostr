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
  readonly #directory?: RelayDirectory;
  readonly #url: RelayUrl;
  readonly #onMaxSubscriptions: (value: number | undefined) => void;
  readonly #onMaxSubscriptionsPending: () => void;

  constructor(
    url: RelayUrl,
    directory: RelayDirectory | undefined,
    onMaxSubscriptions: (value: number | undefined) => void,
    onMaxSubscriptionsPending: () => void,
  ) {
    this.#url = url;
    this.#directory = directory;
    this.#onMaxSubscriptions = onMaxSubscriptions;
    this.#onMaxSubscriptionsPending = onMaxSubscriptionsPending;
    if (!directory) {
      this.transportHooks = {};
      onMaxSubscriptions(undefined);
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
      next: (entry) => {
        if (entry.nip11 !== undefined) onMaxSubscriptions(entry.maxSubscriptions);
      },
      complete: () => onMaxSubscriptions(undefined),
    });
  }

  useAvailableNip11(): void {
    this.#onMaxSubscriptions(this.#directory?.get(this.#url)?.maxSubscriptions);
  }

  async acquireNip11(timeout: number): Promise<void> {
    const directory = this.#directory;
    if (!directory) return;
    const cached = directory.get(this.#url);
    if (cached?.nip11 !== undefined) {
      this.#onMaxSubscriptions(cached.maxSubscriptions);
      return;
    }

    this.#onMaxSubscriptionsPending();
    try {
      await directory.fetchNip11(this.#url, { timeout });
    } finally {
      this.#onMaxSubscriptions(directory.get(this.#url)?.maxSubscriptions);
    }
  }

  [Symbol.dispose] = once(() => this.#subscription?.unsubscribe());
  dispose = this[Symbol.dispose];
}
