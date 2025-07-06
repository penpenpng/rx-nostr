import {
  BehaviorSubject,
  combineLatest,
  concat,
  of,
  Subscription,
  type Observable,
} from "rxjs";
import {
  once,
  RelaySet,
  RxDisposables,
  SetOp,
  type RelayUrl,
} from "../libs/index.ts";

export class RxRelays {
  protected disposables = new RxDisposables();
  protected relays = new RelaySet();
  protected stream: BehaviorSubject<Set<RelayUrl>> = this.disposables.add(
    new BehaviorSubject(new Set()),
  );

  constructor(relays?: Iterable<string>) {
    if (relays) {
      this.set(...relays);
    }
  }

  set(...urls: string[]) {
    this.relays = new RelaySet(urls);
    this.emit();
  }

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

  protected static combine(...rxRelays: RxRelays[]) {
    return combineLatest(
      rxRelays.map((rxr) => concat(rxr.asObservable(), of(new Set<string>()))),
    );
  }

  static difference(rxRelaysX: RxRelays, rxRelaysY: RxRelays): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(rxRelaysX, rxRelaysY).subscribe(([x, y]) => {
      rxr.set(...x.difference(y));
    });

    rxr.disposables.add(sub);

    return rxr;
  }

  static intersection(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...SetOp.intersection(...sets));
    });

    rxr.disposables.add(sub);

    return rxr;
  }

  static union(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...SetOp.union(...sets));
    });

    rxr.disposables.add(sub);

    return rxr;
  }

  static observable(
    relays: RxRelays | Iterable<string>,
  ): Observable<Set<RelayUrl>> {
    if (relays instanceof RxRelays) {
      return relays.asObservable();
    } else {
      return of(new RelaySet(relays).toSet());
    }
  }

  static array(relays: RxRelays | Iterable<string>): RelayUrl[] {
    return [...new RelaySet(relays)];
  }

  subscribe = this.stream.subscribe.bind(this.stream);
  asObservable = this.stream.asObservable.bind(this.stream);

  protected emit() {
    this.stream.next(this.relays.toSet());
  }

  [Symbol.iterator] = () => this.relays[Symbol.iterator]();
  [Symbol.dispose] = once(() => this.disposables.dispose());
  dispose = this[Symbol.dispose];
}
