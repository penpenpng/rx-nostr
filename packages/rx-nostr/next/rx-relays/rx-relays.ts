import { BehaviorSubject, combineLatest, concat, of } from "rxjs";
import { once } from "../libs/once.ts";
import { RelaySet } from "../libs/relay-urls.ts";
import { SetOp } from "../libs/set.ts";
import type { IRxRelays } from "./rx-relays.interface.ts";

export class RxRelays implements IRxRelays, Iterable<string> {
  protected disposables = new DisposableStack();
  protected relays = new RelaySet();
  protected stream: BehaviorSubject<Set<string>> = this.disposables.adopt(
    new BehaviorSubject(new Set()),
    (v) => v.complete(),
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

    rxr.disposables.defer(() => {
      sub.unsubscribe();
    });

    return rxr;
  }

  static intersection(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...SetOp.intersection(...sets));
    });

    rxr.disposables.defer(() => {
      sub.unsubscribe();
    });

    return rxr;
  }

  static union(...rxRelays: RxRelays[]): RxRelays {
    const rxr = new RxRelays();
    const sub = this.combine(...rxRelays).subscribe((sets) => {
      rxr.set(...SetOp.union(...sets));
    });

    rxr.disposables.defer(() => {
      sub.unsubscribe();
    });

    return rxr;
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
