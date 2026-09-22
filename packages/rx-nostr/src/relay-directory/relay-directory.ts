import type * as Nostr from "nostr-typedef";
import { map, type Observable } from "rxjs";
import { RelayMap, normalizeRelayUrl, type RelayUrl } from "../libs/index.ts";
import { RelayDirectorySnapshotError } from "../libs/error.ts";
import { fetchRelayInfo } from "../libs/nostr/nip11.ts";
import type {
  FetchNip11Options,
  IRelayDirectory,
  RelayDirectoryOptions,
} from "./relay-directory.interface.ts";
import type {
  RelayDirectoryEntry,
  RelayDirectorySnapshotEntry,
  RelayDirectorySnapshotV1,
} from "./relay.interface.ts";
import { cloneRelayInfo, copyRelayInfo, RelayRecord } from "./relay.ts";

export interface RelayDirectoryReporter {
  connectionOpened(url: string): () => void;
  connectionFailed(url: string): void;
}

const reporters = new WeakMap<RelayDirectory, RelayDirectoryReporter>();

export class RelayDirectory implements IRelayDirectory {
  readonly #relays = new RelayMap<RelayRecord>();
  readonly #clock: () => number;
  readonly #fetcher: (url: string) => Promise<Nostr.Nip11.RelayInfo>;

  constructor(options: RelayDirectoryOptions = {}) {
    this.#clock = options.clock ?? Date.now;
    this.#fetcher = options.fetcher ?? fetchRelayInfo;
    reporters.set(
      this,
      Object.freeze({
        connectionOpened: (url: string) => this.#getOrCreate(url).connectionOpened(),
        connectionFailed: (url: string) => this.#getOrCreate(url).connectionFailed(),
      }),
    );
  }

  get(url: string): RelayDirectoryEntry | undefined {
    const entry = this.#relays.get(url)?.snapshot();
    return entry && copyEntry(entry);
  }

  getOrCreate(url: string): RelayDirectoryEntry {
    return copyEntry(this.#getOrCreate(url).snapshot());
  }

  forget(url: string): boolean {
    const record = this.#relays.get(url);
    if (!record || !record.forgettable) return false;
    const deleted = this.#relays.delete(record.url, { trusted: true });
    if (deleted) record.dispose();
    return deleted;
  }

  *values(): IterableIterator<RelayDirectoryEntry> {
    for (const relay of this.#relays.values()) yield copyEntry(relay.snapshot());
  }

  [Symbol.iterator](): IterableIterator<RelayDirectoryEntry> {
    return this.values();
  }

  observe(url: string): Observable<RelayDirectoryEntry> {
    return this.#getOrCreate(url).observe().pipe(map(copyEntry));
  }

  fetchNip11(url: string, options: FetchNip11Options = {}): Promise<Nostr.Nip11.RelayInfo> {
    return this.#getOrCreate(url)
      .fetchNip11(options.refresh ?? false)
      .then(copyRelayInfo);
  }

  setNip11(url: string, info: Nostr.Nip11.RelayInfo): Nostr.Nip11.RelayInfo {
    return copyRelayInfo(this.#getOrCreate(url).setNip11(info));
  }

  exportSnapshot(): string {
    const snapshot: RelayDirectorySnapshotV1 = {
      version: 1,
      relays: [...this.#relays.values()]
        .map((relay) => relay.persisted())
        .sort((left, right) => left.url.localeCompare(right.url)),
    };
    return JSON.stringify(snapshot);
  }

  importSnapshot(data: string): void {
    const entries = parseSnapshot(data);
    // Validation above is deliberately complete before the first mutation.
    for (const entry of entries) this.#getOrCreate(entry.url).merge(entry);
  }

  #getOrCreate(url: string): RelayRecord {
    const normalized = normalizeRelayUrl(url);
    if (!normalized) throw new TypeError(`Invalid relay URL: ${url}`);
    return this.#relays.setDefault(
      normalized,
      () => new RelayRecord(normalized, this.#clock, this.#fetcher),
      { trusted: true },
    );
  }
}

function copyEntry(entry: RelayDirectoryEntry): RelayDirectoryEntry {
  return {
    ...entry,
    ...(entry.nip11 === undefined ? {} : { nip11: copyRelayInfo(entry.nip11) }),
  };
}

/** @internal Used by RelayCommunication integration without widening public API. */
export function getRelayDirectoryReporter(directory: RelayDirectory): RelayDirectoryReporter {
  const reporter = reporters.get(directory);
  if (!reporter) throw new TypeError("Unknown RelayDirectory implementation.");
  return reporter;
}

export const GlobalRelayDirectory = new RelayDirectory();

function parseSnapshot(data: string): RelayDirectorySnapshotEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (cause) {
    throw new RelayDirectorySnapshotError("invalid-json", "Snapshot is not valid JSON.", { cause });
  }
  if (!isObject(value)) return invalidSchema("Snapshot must be an object.");
  assertOnlyKeys(value, ["version", "relays"]);
  if (value.version !== 1) {
    if (typeof value.version === "number") {
      throw new RelayDirectorySnapshotError(
        "unsupported-version",
        `Unsupported snapshot version: ${value.version}.`,
      );
    }
    return invalidSchema("Snapshot version is missing or invalid.");
  }
  if (!Array.isArray(value.relays)) {
    return invalidSchema("Snapshot relays must be an array.");
  }

  const entries: RelayDirectorySnapshotEntry[] = [];
  const urls = new Set<RelayUrl>();
  for (const candidate of value.relays) {
    if (!isObject(candidate)) return invalidSchema("Relay entry must be an object.");
    assertOnlyKeys(candidate, [
      "url",
      "nip11",
      "nip11FetchedAt",
      "nip11FailedAt",
      "lastConnectedAt",
      "lastFailureAt",
      "consecutiveFailures",
    ]);
    if (typeof candidate.url !== "string") {
      return invalidSchema("Relay entry URL must be a string.");
    }
    const url = normalizeRelayUrl(candidate.url);
    if (!url) return invalidSchema(`Invalid relay URL: ${candidate.url}.`);
    if (urls.has(url)) return invalidSchema(`Duplicate relay URL: ${url}.`);
    urls.add(url);

    const nip11 = candidate.nip11;
    if (nip11 !== undefined && !isObject(nip11)) {
      return invalidSchema("nip11 must be a JSON object.");
    }
    const nip11FetchedAt = optionalTimestamp(candidate.nip11FetchedAt, "nip11FetchedAt");
    if ((nip11 === undefined) !== (nip11FetchedAt === undefined)) {
      return invalidSchema("nip11 and nip11FetchedAt must be present together.");
    }
    const consecutiveFailures = candidate.consecutiveFailures;
    if (
      typeof consecutiveFailures !== "number" ||
      !Number.isInteger(consecutiveFailures) ||
      consecutiveFailures < 0
    ) {
      return invalidSchema("consecutiveFailures must be a non-negative integer.");
    }
    const lastConnectedAt = optionalTimestamp(candidate.lastConnectedAt, "lastConnectedAt");
    const lastFailureAt = optionalTimestamp(candidate.lastFailureAt, "lastFailureAt");
    if (consecutiveFailures > 0 && lastFailureAt === undefined) {
      return invalidSchema("lastFailureAt is required when consecutiveFailures is non-zero.");
    }
    if (
      consecutiveFailures > 0 &&
      lastConnectedAt !== undefined &&
      lastConnectedAt >= (lastFailureAt as number)
    ) {
      return invalidSchema("consecutiveFailures must be zero after the latest connection success.");
    }

    entries.push(
      Object.freeze({
        url,
        ...(nip11 === undefined ? {} : { nip11: cloneRelayInfo(nip11 as Nostr.Nip11.RelayInfo) }),
        ...(nip11FetchedAt === undefined ? {} : { nip11FetchedAt }),
        ...optionalTimestampProperty(candidate, "nip11FailedAt"),
        ...(lastConnectedAt === undefined ? {} : { lastConnectedAt }),
        ...(lastFailureAt === undefined ? {} : { lastFailureAt }),
        consecutiveFailures,
      }),
    );
  }
  return entries;
}

function optionalTimestampProperty<K extends "nip11FailedAt" | "lastConnectedAt" | "lastFailureAt">(
  object: Record<string, unknown>,
  key: K,
): Partial<Record<K, number>> {
  const value = optionalTimestamp(object[key], key);
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

function optionalTimestamp(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return invalidSchema(`${name} must be a non-negative finite number.`);
  }
  return value;
}

function assertOnlyKeys(object: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) invalidSchema(`Unknown relay entry field: ${key}.`);
  }
}

function invalidSchema(message: string): never {
  throw new RelayDirectorySnapshotError("invalid-schema", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
