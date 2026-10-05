import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";

import type { RelayDirectoryEntry, RelayDirectorySnapshotV1 } from "./relay.interface.ts";

export interface FetchNip11Options {
  /** Ignore cached metadata. Concurrent refreshes are still deduplicated. */
  readonly refresh?: boolean;
  /** Maximum time to wait for metadata, in milliseconds. Infinity disables the timeout. */
  readonly timeout?: number;
}

export interface RelayDirectoryOptions {
  readonly clock?: () => number;
  readonly fetcher?: (url: string) => Promise<Nostr.Nip11.RelayInfo>;
}

/**
 * Public read/cache contract for consumers of directory data. RxNostr's
 * relayDirectory option accepts RelayDirectory instances, not arbitrary
 * implementations of this interface: connection health and probe coordination
 * use an internal reporter registered by that class's constructor.
 */
export interface IRelayDirectory extends Iterable<RelayDirectoryEntry> {
  get(url: string): RelayDirectoryEntry | undefined;
  getOrCreate(url: string): RelayDirectoryEntry;
  forget(url: string): boolean;
  /** Clears the failure streak and permits an immediate health re-evaluation. */
  resetHealth(url: string): void;
  values(): IterableIterator<RelayDirectoryEntry>;
  observe(url: string): Observable<RelayDirectoryEntry>;
  fetchNip11(url: string, options?: FetchNip11Options): Promise<Nostr.Nip11.RelayInfo>;
  setNip11(url: string, info: Nostr.Nip11.RelayInfo): Nostr.Nip11.RelayInfo;
  exportSnapshot(): string;
  importSnapshot(data: string): void;
}

export type RelayDirectorySnapshot = RelayDirectorySnapshotV1;
