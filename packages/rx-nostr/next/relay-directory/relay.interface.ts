import type * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../libs/index.ts";

/** Immutable metadata and aggregate health for one normalized relay URL. */
export interface RelayDirectoryEntry {
  readonly url: RelayUrl;
  readonly nip11?: Readonly<Nostr.Nip11.RelayInfo>;
  readonly nip11FetchedAt?: number;
  readonly nip11FailedAt?: number;
  readonly lastConnectedAt?: number;
  readonly lastFailureAt?: number;
  readonly consecutiveFailures: number;
  readonly liveConnections: number;
  readonly maxSubscriptions?: number;
}

export interface RelayDirectorySnapshotEntry {
  readonly url: RelayUrl;
  readonly nip11?: Readonly<Nostr.Nip11.RelayInfo>;
  readonly nip11FetchedAt?: number;
  readonly nip11FailedAt?: number;
  readonly lastConnectedAt?: number;
  readonly lastFailureAt?: number;
  readonly consecutiveFailures: number;
}

export interface RelayDirectorySnapshotV1 {
  readonly version: 1;
  readonly relays: readonly RelayDirectorySnapshotEntry[];
}
