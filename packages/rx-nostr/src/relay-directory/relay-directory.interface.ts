import type * as Nostr from "nostr-typedef";
import type { Observable } from "rxjs";
import type { RelayDirectoryEntry, RelayDirectorySnapshotV1 } from "./relay.interface.ts";

export interface FetchNip11Options {
  /** Ignore cached metadata. Concurrent refreshes are still deduplicated. */
  readonly refresh?: boolean;
}

export interface RelayDirectoryOptions {
  readonly clock?: () => number;
  readonly fetcher?: (url: string) => Promise<Nostr.Nip11.RelayInfo>;
}

export interface IRelayDirectory extends Iterable<RelayDirectoryEntry> {
  get(url: string): RelayDirectoryEntry | undefined;
  getOrCreate(url: string): RelayDirectoryEntry;
  forget(url: string): boolean;
  values(): IterableIterator<RelayDirectoryEntry>;
  observe(url: string): Observable<RelayDirectoryEntry>;
  fetchNip11(url: string, options?: FetchNip11Options): Promise<Readonly<Nostr.Nip11.RelayInfo>>;
  setNip11(url: string, info: Nostr.Nip11.RelayInfo): Readonly<Nostr.Nip11.RelayInfo>;
  exportSnapshot(): string;
  importSnapshot(data: string): void;
}

export type RelayDirectorySnapshot = RelayDirectorySnapshotV1;
