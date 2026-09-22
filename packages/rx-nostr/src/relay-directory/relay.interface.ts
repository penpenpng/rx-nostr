import type * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../libs/index.ts";

/** Detached metadata and aggregate health for one normalized relay URL. */
export interface RelayDirectoryEntry {
  url: RelayUrl;
  nip11?: Nostr.Nip11.RelayInfo;
  nip11FetchedAt?: number;
  nip11FailedAt?: number;
  lastConnectedAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
  liveConnections: number;
  maxSubscriptions?: number;
}

export interface RelayDirectorySnapshotEntry {
  url: RelayUrl;
  nip11?: Nostr.Nip11.RelayInfo;
  nip11FetchedAt?: number;
  nip11FailedAt?: number;
  lastConnectedAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
}

export interface RelayDirectorySnapshotV1 {
  version: 1;
  relays: RelayDirectorySnapshotEntry[];
}
