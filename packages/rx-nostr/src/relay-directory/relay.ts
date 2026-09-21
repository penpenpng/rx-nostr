import type * as Nostr from "nostr-typedef";
import { BehaviorSubject, type Observable } from "rxjs";
import { once, type RelayUrl } from "../libs/index.ts";
import type {
  RelayDirectoryEntry,
  RelayDirectorySnapshotEntry,
} from "./relay.interface.ts";

export type Nip11Fetcher = (url: string) => Promise<Nostr.Nip11.RelayInfo>;

/** @internal Mutable backing record. Public consumers only receive snapshots. */
export class RelayRecord {
  readonly #updates: BehaviorSubject<RelayDirectoryEntry>;
  #nip11?: Readonly<Nostr.Nip11.RelayInfo>;
  #nip11FetchedAt?: number;
  #nip11FailedAt?: number;
  #lastConnectedAt?: number;
  #lastFailureAt?: number;
  #consecutiveFailures = 0;
  #liveConnections = 0;
  #inflight?: Promise<Readonly<Nostr.Nip11.RelayInfo>>;

  constructor(
    readonly url: RelayUrl,
    private readonly clock: () => number,
    private readonly fetcher: Nip11Fetcher,
  ) {
    this.#updates = new BehaviorSubject(this.snapshot());
  }

  snapshot(): RelayDirectoryEntry {
    const maxSubscriptions = readMaxSubscriptions(this.#nip11);
    return Object.freeze({
      url: this.url,
      ...(this.#nip11 === undefined ? {} : { nip11: this.#nip11 }),
      ...(this.#nip11FetchedAt === undefined
        ? {}
        : { nip11FetchedAt: this.#nip11FetchedAt }),
      ...(this.#nip11FailedAt === undefined
        ? {}
        : { nip11FailedAt: this.#nip11FailedAt }),
      ...(this.#lastConnectedAt === undefined
        ? {}
        : { lastConnectedAt: this.#lastConnectedAt }),
      ...(this.#lastFailureAt === undefined
        ? {}
        : { lastFailureAt: this.#lastFailureAt }),
      consecutiveFailures: this.#consecutiveFailures,
      liveConnections: this.#liveConnections,
      ...(maxSubscriptions === undefined ? {} : { maxSubscriptions }),
    });
  }

  persisted(): RelayDirectorySnapshotEntry {
    return Object.freeze({
      url: this.url,
      ...(this.#nip11 === undefined ? {} : { nip11: this.#nip11 }),
      ...(this.#nip11FetchedAt === undefined
        ? {}
        : { nip11FetchedAt: this.#nip11FetchedAt }),
      ...(this.#nip11FailedAt === undefined
        ? {}
        : { nip11FailedAt: this.#nip11FailedAt }),
      ...(this.#lastConnectedAt === undefined
        ? {}
        : { lastConnectedAt: this.#lastConnectedAt }),
      ...(this.#lastFailureAt === undefined
        ? {}
        : { lastFailureAt: this.#lastFailureAt }),
      consecutiveFailures: this.#consecutiveFailures,
    });
  }

  observe(): Observable<RelayDirectoryEntry> {
    return this.#updates.asObservable();
  }

  fetchNip11(refresh: boolean): Promise<Readonly<Nostr.Nip11.RelayInfo>> {
    if (!refresh && this.#nip11) return Promise.resolve(this.#nip11);
    if (this.#inflight) return this.#inflight;

    const request = this.fetcher(this.url).then(
      (info) => {
        this.#nip11 = cloneRelayInfo(info);
        this.#nip11FetchedAt = this.clock();
        this.#emit();
        return this.#nip11;
      },
      (error) => {
        this.#nip11FailedAt = this.clock();
        this.#emit();
        throw error;
      },
    );
    this.#inflight = request.finally(() => {
      this.#inflight = undefined;
    });
    return this.#inflight;
  }

  setNip11(info: Nostr.Nip11.RelayInfo): Readonly<Nostr.Nip11.RelayInfo> {
    this.#nip11 = cloneRelayInfo(info);
    this.#nip11FetchedAt = this.clock();
    this.#emit();
    return this.#nip11;
  }

  connectionOpened(): () => void {
    this.#liveConnections++;
    this.#lastConnectedAt = this.clock();
    this.#consecutiveFailures = 0;
    this.#emit();

    return once(() => {
      this.#liveConnections = Math.max(0, this.#liveConnections - 1);
      this.#emit();
    });
  }

  connectionFailed(): void {
    this.#lastFailureAt = this.clock();
    this.#consecutiveFailures++;
    this.#emit();
  }

  merge(entry: RelayDirectorySnapshotEntry): void {
    if (
      entry.nip11 &&
      entry.nip11FetchedAt !== undefined &&
      (this.#nip11FetchedAt === undefined ||
        entry.nip11FetchedAt >= this.#nip11FetchedAt)
    ) {
      this.#nip11 = cloneRelayInfo(entry.nip11);
      this.#nip11FetchedAt = entry.nip11FetchedAt;
    }
    this.#nip11FailedAt = maxDefined(this.#nip11FailedAt, entry.nip11FailedAt);

    const currentFailureAt = this.#lastFailureAt;
    const importedFailureAt = entry.lastFailureAt;
    this.#lastConnectedAt = maxDefined(
      this.#lastConnectedAt,
      entry.lastConnectedAt,
    );
    this.#lastFailureAt = maxDefined(currentFailureAt, importedFailureAt);
    if (
      this.#lastFailureAt !== undefined &&
      (this.#lastConnectedAt === undefined ||
        this.#lastFailureAt > this.#lastConnectedAt)
    ) {
      if (importedFailureAt === this.#lastFailureAt) {
        this.#consecutiveFailures =
          currentFailureAt === importedFailureAt
            ? Math.max(this.#consecutiveFailures, entry.consecutiveFailures)
            : entry.consecutiveFailures;
      }
    } else {
      this.#consecutiveFailures = 0;
    }
    this.#emit();
  }

  get forgettable(): boolean {
    return this.#liveConnections === 0 && this.#inflight === undefined;
  }

  dispose(): void {
    this.#updates.complete();
  }

  #emit(): void {
    this.#updates.next(this.snapshot());
  }
}

export function cloneRelayInfo(
  info: Nostr.Nip11.RelayInfo | Readonly<Nostr.Nip11.RelayInfo>,
): Readonly<Nostr.Nip11.RelayInfo> {
  let clone: unknown;
  try {
    clone = JSON.parse(JSON.stringify(info));
  } catch (cause) {
    throw new TypeError("NIP-11 metadata must be JSON-serializable.", {
      cause,
    });
  }
  if (typeof clone !== "object" || clone === null || Array.isArray(clone)) {
    throw new TypeError("NIP-11 metadata must be a JSON object.");
  }
  return deepFreeze(clone) as Readonly<Nostr.Nip11.RelayInfo>;
}

function deepFreeze(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function readMaxSubscriptions(
  info: Readonly<Nostr.Nip11.RelayInfo> | undefined,
): number | undefined {
  const value = info?.limitation?.max_subscriptions;
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function maxDefined(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}
