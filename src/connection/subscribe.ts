import Nostr from "nostr-typedef";
import { filter, Observable, Subject } from "rxjs";

import type { RxNostrConfig } from "../config.js";
import { evalFilters } from "../lazy-filter.js";
import { Nip11Registry } from "../nip11.js";
import { verify } from "../nostr/event.js";
import { isFiltered } from "../nostr/filter.js";
import { LazyREQ } from "../packet.js";
import { RelayConnection } from "./relay.js";
import { CounterSubject } from "./util.js";

export class SubscribeProxy {
  // maxSubscriptions: number | null = undefined;
  // maxFilters: number | null;
  // maxLimit: number | null;
  private subs = new Map<string, SubRecord>();
  private disposed = false;
  private queue: SubQueue;

  constructor(private relay: RelayConnection, private config: RxNostrConfig) {
    this.queue = new SubQueue(relay.url, config);

    // Dequeuing
    this.queue.getActivationObservable().subscribe((activated) => {
      for (const { req } of activated) {
        this.sendREQ(req);
      }
    });

    // Recovering
    this.relay.getReconnectedObservable().subscribe(() => {
      for (const { req } of this.queue.ongoings) {
        this.sendREQ(req);
      }
    });

    // Auto closing
    this.relay.getEOSEObservable().subscribe(([, subId]) => {
      if (this.subs.get(subId)?.autoclose) {
        this.unsubscribe(subId);
      }
    });
  }

  subscribe(req: LazyREQ, autoclose: boolean): void {
    if (this.disposed) {
      return;
    }

    const subId = req[1];
    const sub: SubRecord = {
      subId,
      req,
      autoclose,
    };

    this.subs.set(subId, sub);
    this.queue.enqueue(sub);
  }
  unsubscribe(subId: string): void {
    if (this.disposed) {
      return;
    }

    this.sendCLOSE(subId);
    this.subs.delete(subId);
    this.queue.drop(subId);
  }

  isOngoingOrQueued(subId: string): boolean {
    return this.queue.has(subId);
  }

  getEventObservable(): Observable<Nostr.ToClientMessage.EVENT> {
    return this.relay.getEVENTObservable().pipe(
      filter(([, subId, event]) => {
        const filters = this.subs.get(subId)?.filters;
        if (!filters) {
          return false;
        }

        return (
          (this.config.skipValidateFilterMatching ||
            isFiltered(event, filters)) &&
          (this.config.skipVerify || verify(event))
        );
      })
    );
  }
  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.queue.getSizeObservable();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.queue.dispose();
  }

  private sendREQ([, subId, ...lazyFilters]: LazyREQ) {
    const filters = evalFilters(lazyFilters);
    const sub = this.subs.get(subId);
    if (!sub) {
      return;
    }

    sub.filters = filters;
    this.relay.send(["REQ", subId, ...filters]);
  }
  private sendCLOSE(subId: string) {
    this.relay.send(["CLOSE", subId]);
  }
}

interface SubRecord {
  subId: string;
  req: LazyREQ;
  filters?: Nostr.Filter[];
  autoclose: boolean;
}

class SubQueue {
  private _queuings: SubRecord[] = [];
  private _ongoings: SubRecord[] = [];
  private activated$ = new Subject<SubRecord[]>();
  private count$ = new CounterSubject();

  get queuings(): SubRecord[] {
    return this._queuings;
  }
  private set queuings(v: SubRecord[]) {
    this._queuings = v;
  }
  get ongoings(): SubRecord[] {
    return this._ongoings;
  }
  private set ongoings(v: SubRecord[]) {
    this._ongoings = v;
  }

  constructor(private url: string, private config: RxNostrConfig) {}

  enqueue(v: SubRecord): void {
    this.queuings = [...this.queuings, v];
    this.count$.increment();

    this.shift();
  }
  drop(subId: string): void {
    const remove = (arr: SubRecord[], subId: string): [SubRecord[], number] => {
      const prevLength = arr.length;
      const filtered = arr.filter((e) => e.subId !== subId);
      const removed = prevLength - filtered.length;

      return [filtered, removed];
    };

    const [queuings, droppedX] = remove(this.queuings, subId);
    const [ongoings, droppedY] = remove(this.ongoings, subId);
    this.queuings = queuings;
    this.ongoings = ongoings;
    this.count$.next((v) => v - (droppedX + droppedY));

    this.shift();
  }
  has(subId: string) {
    return (
      !!this.ongoings.find((e) => e.subId === subId) ||
      !!this.queuings.find((e) => e.subId === subId)
    );
  }

  getActivationObservable() {
    return this.activated$.asObservable();
  }
  getSizeObservable() {
    return this.count$.asObservable();
  }

  dispose() {
    const subjects = [this.activated$, this.count$];
    for (const sub of subjects) {
      sub.complete();
    }
  }

  private async shift() {
    const capacity = await this.capacity();

    const concated = [...this.ongoings, ...this.queuings];
    const ongoings = concated.slice(0, capacity);
    const queuings = concated.slice(capacity);
    const activated = this.queuings.slice(0, capacity - this.ongoings.length);

    this.ongoings = ongoings;
    this.queuings = queuings;

    if (activated.length > 0) {
      this.activated$.next(activated);
    }
  }

  private async capacity() {
    const nip11 = this.config.skipFetchNip11
      ? await Nip11Registry.getOrDefault(this.url)
      : await Nip11Registry.getOrFetch(this.url);
    return nip11.limitation?.max_subscriptions ?? Infinity;
  }
}
