import Nostr from "nostr-typedef";
import { filter, Observable, Subject } from "rxjs";

import type { RxNostrConfig } from "../config/index.js";
import { evalFilters } from "../lazy-filter.js";
import { Nip11Registry } from "../nip11.js";
import { isFiltered } from "../nostr/filter.js";
import { isExpired } from "../nostr/nip40.js";
import { EventPacket, LazyREQ, OkPacket } from "../packet.js";
import { AuthProxy } from "./auth.js";
import { RelayConnection } from "./relay.js";
import { CounterSubject } from "./utils.js";

export interface FinPacket {
  from: string;
  subId: string;
}

export class SubscribeProxy {
  // maxSubscriptions: number | null = undefined;
  // maxFilters: number | null;
  // maxLimit: number | null;
  private relay: RelayConnection;
  private authProxy: AuthProxy | null;
  private config: RxNostrConfig;
  private subs = new Map<string, SubRecord>();
  private fin$ = new Subject<FinPacket>();
  private disposed = false;
  private queue: SubQueue;

  constructor(params: {
    relay: RelayConnection;
    authProxy: AuthProxy | null;
    config: RxNostrConfig;
  }) {
    this.relay = params.relay;
    this.authProxy = params.authProxy;
    this.config = params.config;

    this.queue = new SubQueue(this.relay.url, this.config);

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
    this.relay.getEOSEObservable().subscribe(({ subId }) => {
      if (this.subs.get(subId)?.autoclose) {
        this.unsubscribe(subId);
      }
    });

    // Mark as closed
    this.relay.getCLOSEDObservable().subscribe(async ({ subId, notice }) => {
      const sub = this.subs.get(subId);
      if (!sub) {
        return;
      }

      if (!this.authProxy || !notice?.startsWith("auth-required:")) {
        this.fin(subId);
        return;
      }

      let authResult: OkPacket;
      try {
        authResult = await this.authProxy.nextAuth();
      } catch {
        this.fin(subId);
        return;
      }

      const req = this.subs.get(subId)?.req;
      if (authResult.ok && req) {
        this.sendREQ(req);
      } else {
        this.fin(subId);
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

    if (this.subs.has(subId)) {
      this.sendCLOSE(subId);
    }
    this.fin(subId);
  }

  isOngoingOrQueued(subId: string): boolean {
    return this.subs.has(subId);
  }

  getEventObservable(): Observable<EventPacket> {
    return this.relay.getEVENTObservable().pipe(
      filter(({ subId, event }) => {
        const filters = this.subs.get(subId)?.filters;
        if (!filters) {
          return false;
        }

        return (
          (this.config.skipValidateFilterMatching ||
            isFiltered(event, filters)) &&
          (this.config.skipVerify || this.config.verifier(event)) &&
          (this.config.skipExpirationCheck || !isExpired(event))
        );
      })
    );
  }
  getFinObservable(): Observable<FinPacket> {
    return this.fin$.asObservable();
  }
  getLogicalConnectionSizeObservable(): Observable<number> {
    return this.queue.getSizeObservable();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    const subjects = [this.fin$];
    for (const sub of subjects) {
      sub.complete();
    }

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
  private fin(subId: string) {
    this.subs.delete(subId);
    this.queue.drop(subId);
    this.fin$.next({
      from: this.relay.url,
      subId,
    });
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
    const capacity = await Nip11Registry.getValue(
      this.url,
      (data) => data.limitation?.max_subscriptions,
      {
        skipFetch: this.config.skipFetchNip11,
      }
    );
    return capacity ?? Infinity;
  }
}
