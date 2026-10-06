import { BehaviorSubject, combineLatest, concat, EMPTY, map, of, type Observable } from "rxjs";

import { once, RelaySet, RxDisposableStack, u, type RelayUrl } from "../libs/index.ts";

export class RxRelays {
  protected stack = new RxDisposableStack();
  protected relays = new RelaySet();
  protected stream: BehaviorSubject<Set<RelayUrl>> = this.stack.add(new BehaviorSubject(new Set()));
  readonly #publicStream = this.stream.pipe(map((relays) => new Set(relays)));

  constructor(relays?: Iterable<string>) {
    if (!relays) {
      return;
    }

    if (typeof relays === "string") {
      this.set(relays);
    } else {
      this.set(...relays);
    }
  }

  set(...urls: string[]) {
    this.relays = new RelaySet(urls);

    this.emit();
  }

  /** Return a detached, mutable snapshot of the current relays. */
  get() {
    return this.relays.toSet();
  }

  append(...urls: string[]) {
    for (const url of urls) {
      this.relays.add(url);
    }

    this.emit();
  }

  remove(...urls: string[]) {
    for (const url of urls) {
      this.relays.delete(url);
    }

    this.emit();
  }

  has(url: string): boolean {
    return this.relays.has(url);
  }

  clear() {
    this.relays.clear();
    this.emit();
  }

  get size(): number {
    return this.relays.size;
  }

  protected static combine(...rxRelays: RxRelays[]) {
    return combineLatest(rxRelays.map((rxr) => concat(rxr.asObservable(), of(new Set<string>()))));
  }

  static difference(rxRelaysX: RxRelays, rxRelaysY: RxRelays): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(rxRelaysX, rxRelaysY).subscribe(([x, y]) => {
      rxr.set(...x.difference(y));
    });

    rxr.stack.add(sub);

    return rxr;
  }

  // TODO: { move: boolean } で dispose されたときに親も dispose する
  static intersection(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...u.Set.intersection(...sets));
    });

    rxr.stack.add(sub);

    return rxr;
  }

  static union(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...u.Set.union(...sets));
    });

    rxr.stack.add(sub);

    return rxr;
  }

  static from(relays: RxRelays | Iterable<string> | null | undefined): RxRelays {
    if (!relays) {
      return RxRelays.empty();
    }

    if (relays instanceof RxRelays) {
      return RxRelays.union(relays);
    } else {
      return new RxRelays(relays);
    }
  }

  static observable(
    relays: RxRelays | Iterable<string> | null | undefined,
  ): Observable<Set<RelayUrl>> {
    if (!relays) {
      return EMPTY;
    }

    if (relays instanceof RxRelays) {
      return relays.asObservable();
    } else {
      // A fixed iterable is still copied per subscriber, just like a live RxRelays.
      return of(new RelaySet(relays).toSet()).pipe(map((snapshot) => new Set(snapshot)));
    }
  }

  static set(relays: RxRelays | Iterable<string> | null | undefined): Set<RelayUrl> {
    if (!relays) {
      return new Set();
    }

    return new RelaySet(relays).toSet();
  }

  static array(relays: RxRelays | Iterable<string> | null | undefined): RelayUrl[] {
    if (!relays) {
      return [];
    }

    return [...new RelaySet(relays)];
  }

  static empty(): RxRelays {
    const rxr = new RxRelays();

    rxr.dispose();

    return rxr;
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
