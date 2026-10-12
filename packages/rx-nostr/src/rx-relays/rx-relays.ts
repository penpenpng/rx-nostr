import { BehaviorSubject, combineLatest, concat, EMPTY, map, of, type Observable } from "rxjs";

import { RxNostrAlreadyDisposedError } from "../libs/error.ts";
import { once, RelaySet, RxDisposableStack, u, type RelayUrl } from "../libs/index.ts";
import type { RelayInput } from "../types/relay-input.ts";
import { RelayUrls, assertRelayInput } from "./relay-urls.ts";

export class ReadonlyRxRelays {
  protected stack = new RxDisposableStack();
  protected relays = new RelaySet();
  protected stream: BehaviorSubject<Set<RelayUrl>> = this.stack.add(new BehaviorSubject(new Set()));
  readonly #publicStream = this.stream.pipe(map((relays) => new Set(relays)));

  constructor(relays?: RelayInput) {
    this.relays = RelayUrls.toRelaySet(relays);

    this.emit();
  }

  protected update(...urls: string[]) {
    this.relays = new RelaySet(urls);

    this.emit();
  }

  protected static derive(source: Observable<Set<string>>): ReadonlyRxRelays {
    const rxr = new ReadonlyRxRelays();

    rxr.stack.add(source.subscribe((urls) => rxr.update(...urls)));

    return rxr;
  }

  /** Return a detached, mutable snapshot of the current relays. */
  toArray(): RelayUrl[] {
    return [...this.relays];
  }

  has(url: string): boolean {
    return this.relays.has(url);
  }

  get size(): number {
    return this.relays.size;
  }

  /** Each subscription receives a detached, mutable Set. */
  subscribe = this.#publicStream.subscribe.bind(this.#publicStream);
  asObservable = () => this.#publicStream;

  protected emit() {
    this.stream.next(this.relays.toSet());
  }

  get disposed() {
    return this.stack.disposed;
  }

  [Symbol.iterator] = () => this.relays[Symbol.iterator]();
  [Symbol.dispose] = once(() => this.stack.dispose());
  dispose = this[Symbol.dispose];
}

export class RxRelays extends ReadonlyRxRelays {
  replace(...urls: string[]) {
    this.#assertActive();
    this.update(...urls);
  }

  append(...urls: string[]) {
    this.#assertActive();

    for (const url of urls) {
      this.relays.add(url);
    }

    this.emit();
  }

  remove(...urls: string[]) {
    this.#assertActive();

    for (const url of urls) {
      this.relays.delete(url);
    }

    this.emit();
  }

  clear() {
    this.#assertActive();
    this.relays.clear();
    this.emit();
  }

  protected static combine(...rxRelays: ReadonlyRxRelays[]) {
    return combineLatest(rxRelays.map((rxr) => concat(rxr.asObservable(), of(new Set<string>()))));
  }

  static difference(rxRelaysX: ReadonlyRxRelays, rxRelaysY: ReadonlyRxRelays): ReadonlyRxRelays {
    return this.derive(this.combine(rxRelaysX, rxRelaysY).pipe(map(([x, y]) => x.difference(y))));
  }

  static intersection(...rxRelays: ReadonlyRxRelays[]): ReadonlyRxRelays {
    return this.derive(this.combine(...rxRelays).pipe(map((sets) => u.Set.intersection(...sets))));
  }

  static union(...rxRelays: ReadonlyRxRelays[]): ReadonlyRxRelays {
    return this.derive(this.combine(...rxRelays).pipe(map((sets) => u.Set.union(...sets))));
  }

  static from(relays: RelayInput | null | undefined): ReadonlyRxRelays {
    if (!relays) {
      return RxRelays.empty();
    }

    if (relays instanceof ReadonlyRxRelays) {
      return RxRelays.union(relays);
    } else {
      return new ReadonlyRxRelays(relays);
    }
  }

  static observable(relays: RelayInput | null | undefined): Observable<Set<RelayUrl>> {
    if (!relays) {
      return EMPTY;
    }

    if (relays instanceof ReadonlyRxRelays) {
      return relays.asObservable();
    } else {
      // A fixed iterable is still copied per subscriber, just like a live RxRelays.
      assertRelayInput(relays);

      return of(new RelaySet(relays).toSet()).pipe(map((snapshot) => new Set(snapshot)));
    }
  }

  static empty(): ReadonlyRxRelays {
    const rxr = new ReadonlyRxRelays();

    rxr.dispose();

    return rxr;
  }

  #assertActive(): void {
    if (this.disposed) {
      throw new RxNostrAlreadyDisposedError();
    }
  }
}
