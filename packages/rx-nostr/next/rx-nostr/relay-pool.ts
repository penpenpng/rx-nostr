import { once, RelayMap, type RelayUrl } from "../libs/index.ts";
import { RxNostrAlreadyDisposedError } from "../libs/error.ts";
import { normalizeRelayUrl } from "../libs/relay-urls.ts";
import type { IRelayCommunication } from "./relay-communication.ts";

export interface RelayCommunicationCollection<
  T extends IRelayCommunication = IRelayCommunication,
> {
  get(relay: RelayUrl): T;
  forEach(
    relays: Iterable<RelayUrl> | null | undefined,
    callback: (value: T) => void,
  ): void;
  map<R>(
    relays: Iterable<RelayUrl> | null | undefined,
    project: (value: T) => R,
  ): R[];
}

/** Per-RxNostr owner of one RelayCommunication for each normalized URL. */
export class RelayPool<T extends IRelayCommunication & Disposable>
  implements RelayCommunicationCollection<T>
{
  readonly #entries = new RelayMap<T>();
  #disposed = false;

  constructor(private readonly factory: (relay: RelayUrl) => T) {}

  get(relay: RelayUrl): T {
    if (this.#disposed) throw new RxNostrAlreadyDisposedError();
    const normalized = normalizeRelayUrl(relay);
    if (!normalized) {
      throw new TypeError(`Invalid relay URL: ${relay}`);
    }
    return this.#entries.setDefault(
      normalized,
      () => this.factory(normalized),
      { trusted: true },
    );
  }

  forEach(
    relays: Iterable<RelayUrl> | null | undefined,
    callback: (value: T) => void,
  ): void {
    if (!relays) return;
    for (const relay of relays) callback(this.get(relay));
  }

  map<R>(
    relays: Iterable<RelayUrl> | null | undefined,
    project: (value: T) => R,
  ): R[] {
    if (!relays) return [];
    return [...relays].map((relay) => project(this.get(relay)));
  }

  get size(): number {
    return this.#entries.size;
  }

  [Symbol.dispose] = once(() => {
    this.#disposed = true;
    for (const relay of this.#entries.values()) relay[Symbol.dispose]();
    this.#entries.clear();
  });
  dispose = this[Symbol.dispose];
}
