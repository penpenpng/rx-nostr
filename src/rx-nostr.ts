import Nostr from "nostr-typedef";
import {
  catchError,
  EMPTY,
  filter,
  finalize,
  first,
  identity,
  map,
  merge,
  mergeAll,
  mergeMap,
  MonoTypeOperatorFunction,
  Observable,
  of,
  OperatorFunction,
  ReplaySubject,
  Subject,
  Subscription,
  take,
  takeUntil,
  tap,
  timeout,
  Unsubscribable,
} from "rxjs";

import { BackoffConfig, Connection } from "./connection.js";
import { getSignedEvent } from "./nostr/event.js";
import { fetchRelayInfo } from "./nostr/nip11.js";
import { completeOnTimeout } from "./operator.js";
import type {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  LazyFilter,
  LazyREQ,
  MessagePacket,
  OkPacket,
} from "./packet.js";
import type { RxReq } from "./req.js";
import { defineDefaultOptions, normalizeRelayUrl } from "./util.js";

/**
 * The core object of rx-nostr, which holds a connection to relays
 * and manages subscriptions as directed by the RxReq object connected by `use()`.
 * Use `createRxNostr()` to get the object.
 */
export interface RxNostr {
  /**
   * Return a list of relays used by this object.
   * The relay URLs are normalised so may not match the URLs set.
   */
  getRelays(): RelayConfig[];

  /**
   * Set the list of relays.
   * If a REQ subscription already exists, the same REQ is issued for the newly added relay
   * and CLOSE is sent for the removed relay.
   */
  switchRelays(config: AcceptableRelaysConfig): Promise<void>;
  /** Utility wrapper for `switchRelays()`. */
  addRelay(relay: string | RelayConfig): Promise<void>;
  /** Utility wrapper for `switchRelays()`. */
  removeRelay(url: string): Promise<void>;

  /** Return true if the given relay is set to rxNostr. */
  hasRelay(url: string): boolean;
  /** Return true if the given relay allows to be written. */
  canWriteRelay(url: string): boolean;
  /** Return true if the given relay allows to be read. */
  canReadRelay(url: string): boolean;

  /** Fetch all relays' info based on [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) */
  fetchAllRelaysInfo(): Promise<Record<string, Nostr.Nip11.RelayInfo | null>>;

  /**
   * Return a dictionary in which you can look up connection state.
   *
   * **NOTE**: Keys are **normalized** URL, so may be different from one you set.
   */
  getAllRelayState(): Record<string, ConnectionState>;
  /**
   * Return connection state of the given relay.
   * Throw if unknown URL is given.
   */
  getRelayState(url: string): ConnectionState;
  /**
   * Attempt to reconnect the WebSocket if its state is `error` or `rejected`.
   * If not, do nothing.
   */
  reconnect(url: string): void;

  /**
   * Associate RxReq with RxNostr.
   * When the associated RxReq is manipulated,
   * the RxNostr issues a new REQ to all relays allowed to be read.
   * The method returns an Observable that issues EventPackets
   * when an EVENT is received that is subscribed by RxReq.
   * You can unsubscribe the Observable to CLOSE.
   */
  use(
    rxReq: RxReq,
    options?: Partial<RxNostrUseOptions>
  ): Observable<EventPacket>;
  /**
   * Create an Observable that receives all events (EVENT) from all websocket connections.
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllEventObservable(): Observable<EventPacket>;
  /**
   * Create an Observable that receives all errors from all websocket connections.
   * Note that an Observable is terminated when it receives any error,
   * so this method is the only way to receive errors arising from multiplexed websocket connections
   * (It means that Observables returned by `use()` never throw error).
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllErrorObservable(): Observable<ErrorPacket>;
  /**
   * Create an Observable that receives all messages from all websocket connections.
   *
   * Nothing happens when this Observable is unsubscribed.
   * */
  createAllMessageObservable(): Observable<MessagePacket>;
  /**
   * Create an Observable that receives changing of WebSocket connection state.
   *
   * Nothing happens when this Observable is unsubscribed.
   */
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;

  /**
   * Attempt to send events to all relays that are allowed to write.
   * The `seckey` option accepts both nsec format and hex format,
   * and if omitted NIP-07 will be automatically used.
   */
  send(
    params: Nostr.EventParameters,
    options?: RxNostrSendOptions
  ): Observable<OkPacket>;

  /**
   * Release all resources held by the RxNostr object.
   * Any Observable resulting from this RxNostr will be in the completed state
   * and will never receive messages again.
   * RxReq used by this object is not affected; in other words, if the RxReq is used
   * by another RxNostr, its use is not prevented.
   */
  dispose(): void;
}

/** Create a RxNostr object. This is the only way to create that. */
export function createRxNostr(options?: Partial<RxNostrOptions>): RxNostr {
  return new RxNostrImpl(options);
}

export interface RxNostrOptions {
  /** Auto reconnection strategy. */
  retry: BackoffConfig;
  /**
   * The time in milliseconds to timeout when following the backward strategy.
   * The observable is terminated when the specified amount of time has elapsed
   * during which no new events are available.
   */
  timeout: number;
}
const makeRxNostrOptions = defineDefaultOptions<RxNostrOptions>({
  retry: {
    strategy: "exponential",
    maxCount: 5,
    initialDelay: 1000,
  },
  timeout: 10000,
});

export interface RxNostrUseOptions {
  scope?: string[];
}
const makeRxNostrUseOptions = defineDefaultOptions<RxNostrUseOptions>({
  scope: undefined,
});

export interface RxNostrSendOptions {
  scope?: string[];
  seckey?: string;
}
const makeRxNostrSendOptions = defineDefaultOptions<RxNostrSendOptions>({
  scope: undefined,
  seckey: undefined,
});

/** Config object specifying WebSocket behavior. */
export interface RelayConfig {
  /** WebSocket endpoint URL. */
  url: string;
  /** If true, rxNostr can publish REQ and subscribe EVENTs. */
  read: boolean;
  /** If true, rxNostr can send EVENTs. */
  write: boolean;
}

/** Parameter of `rxNostr.switchRelays()` */
export type AcceptableRelaysConfig =
  | (string | RelayConfig)[]
  | Nostr.Nip07.GetRelayResult;

class RxNostrImpl implements RxNostr {
  private options: RxNostrOptions;
  private connections: Map<string, Connection> = new Map();
  private ongoings: Map<string, OngoingReq> = new Map();
  private message$: Subject<MessagePacket> = new Subject();
  private error$: Subject<ErrorPacket> = new Subject();
  private status$: Subject<ConnectionStatePacket> = new Subject();

  constructor(options?: Partial<RxNostrOptions>) {
    const opt = makeRxNostrOptions(options);
    this.options = {
      ...opt,
    };
  }

  getRelays(): RelayConfig[] {
    return Array.from(this.connections.values()).map(
      ({ url, read, write }) => ({
        url,
        read,
        write,
      })
    );
  }

  private createConnection({ url, read, write }: RelayConfig): Connection {
    const connection = new Connection(url, {
      backoff: this.options.retry,
      read,
      write,
    });

    connection.getConnectionStateObservable().subscribe((state) => {
      this.status$.next({
        from: url,
        state,
      });
    });
    connection.getErrorObservable().subscribe((reason) => {
      this.error$.next({ from: url, reason });
    });
    connection
      .getMessageObservable()
      .pipe(
        catchError((reason: unknown) => {
          this.error$.next({ from: url, reason });
          return EMPTY;
        })
      )
      .subscribe((v) => {
        this.message$.next(v);
      });

    return connection;
  }

  async switchRelays(config: AcceptableRelaysConfig): Promise<void> {
    const nextConns: Map<string, Connection> = new Map();
    for (const { url, read, write } of normalizeRelaysConfig(config)) {
      // pop a connection if exists
      const prevConn = this.connections.get(url);
      this.connections.delete(url);

      if (prevConn) {
        prevConn.read = read;
        prevConn.write = write;
        nextConns.set(url, prevConn);
      } else {
        nextConns.set(url, this.createConnection({ url, read, write }));
      }
    }

    // connections that are no longer used
    for (const conn of this.connections.values()) {
      conn.dispose();
    }

    const ensureConns: Promise<unknown>[] = [];
    for (const conn of nextConns.values()) {
      if (conn.read) {
        ensureConns.push(conn.start());
      } else {
        conn.stop();
      }
    }

    await Promise.all(ensureConns);

    this.connections = nextConns;

    for (const { req, scope } of this.ongoings.values()) {
      this.ensureReq(req, { scope });
    }

    // --- scoped untility pure functions ---
    function normalizeRelaysConfig(
      config: AcceptableRelaysConfig
    ): RelayConfig[] {
      if (Array.isArray(config)) {
        return config.map((urlOrConfig) => {
          const relay: RelayConfig =
            typeof urlOrConfig === "string"
              ? {
                  url: urlOrConfig,
                  read: true,
                  write: true,
                }
              : urlOrConfig;
          relay.url = normalizeRelayUrl(relay.url);

          return relay;
        });
      } else {
        return Object.entries(config).map(([url, flags]) => ({
          url: normalizeRelayUrl(url),
          ...flags,
        }));
      }
    }
  }
  async addRelay(relay: string | RelayConfig): Promise<void> {
    await this.switchRelays([...this.getRelays(), relay]);
  }
  async removeRelay(url: string): Promise<void> {
    const u = normalizeRelayUrl(url);
    const currentRelays = this.getRelays();
    const nextRelays = currentRelays.filter((relay) => relay.url !== u);
    if (currentRelays.length !== nextRelays.length) {
      await this.switchRelays(nextRelays);
    }
  }
  hasRelay(url: string): boolean {
    const u = normalizeRelayUrl(url);
    return this.getRelays().some((relay) => relay.url === u);
  }
  canWriteRelay(url: string): boolean {
    const u = normalizeRelayUrl(url);
    return this.getRelays().some((relay) => relay.url === u && relay.write);
  }
  canReadRelay(url: string): boolean {
    const u = normalizeRelayUrl(url);
    return this.getRelays().some((relay) => relay.url === u && relay.read);
  }

  async fetchAllRelaysInfo(): Promise<
    Record<string, Nostr.Nip11.RelayInfo | null>
  > {
    const entries = await Promise.all(
      Array.from(this.connections.keys()).map(
        async (url): Promise<[string, Nostr.Nip11.RelayInfo | null]> => [
          url,
          await fetchRelayInfo(url).catch(() => null),
        ]
      )
    );
    return Object.fromEntries(entries);
  }

  getAllRelayState(): Record<string, ConnectionState> {
    return Object.fromEntries(
      Array.from(this.connections.values()).map((e) => [
        e.url,
        this.getRelayState(e.url),
      ])
    );
  }
  getRelayState(url: string): ConnectionState {
    const conn = this.connections.get(normalizeRelayUrl(url));
    if (!conn) {
      throw new Error("RelayConfig not found");
    }
    // this.relays[url] may be set before this.relays[url].websocket is initialized
    return conn?.getConnectionState() ?? "not-started";
  }
  reconnect(url: string): void {
    if (this.canReadRelay(url)) {
      this.connections.get(normalizeRelayUrl(url))?.start();
    }
  }

  use(
    rxReq: RxReq,
    options?: Partial<RxNostrUseOptions>
  ): Observable<EventPacket> {
    const { scope: _scope } = makeRxNostrUseOptions(options);
    const scope = _scope?.map(normalizeRelayUrl);

    const TIMEOUT = this.options.timeout;
    const strategy = rxReq.strategy;
    const rxReqId = rxReq.rxReqId;
    const message$ = this.message$;
    const ongoings = this.ongoings;

    const getAllRelayState = this.getAllRelayState.bind(this);
    const createConnectionStateObservable =
      this.createConnectionStateObservable.bind(this);
    const ensureReq = this.ensureReq.bind(this);
    const finalizeReq = this.finalizeReq.bind(this);

    const subId$ = rxReq.getReqObservable().pipe(
      filter((filters): filters is LazyFilter[] => filters !== null),
      strategy === "oneshot" ? first() : identity,
      attachSubId(),
      strategy === "forward" ? manageActiveForwardReq() : identity,
      tap((req) => {
        ensureReq(req, { overwrite: strategy === "forward", scope });
      }),
      map(([, subId]) => subId)
    );

    if (strategy === "forward") {
      const subId = makeSubId({
        rxReqId,
      });

      const resource: Unsubscribable[] = [];
      const subject = new Subject<EventPacket>();
      resource.push(subject);

      return subject.pipe(
        tap({
          subscribe: () => {
            resource.push(subId$.subscribe());
            resource.push(
              message$
                .pipe(filterBySubId(subId), pickEvents())
                .subscribe((v) => {
                  subject.next(v);
                })
            );
          },
          finalize: () => {
            for (const r of resource) {
              r.unsubscribe();
            }
            finalizeReq({ subId });
          },
        })
      );
    } else {
      return subId$.pipe(map(createEoseManagedEventObservable), mergeAll());
    }

    function attachSubId(): OperatorFunction<LazyFilter[], LazyREQ> {
      const makeId = (index?: number) => makeSubId({ rxReqId, index });

      switch (strategy) {
        case "backward":
          return map((filters, index) => ["REQ", makeId(index), ...filters]);
        case "forward":
        case "oneshot":
          return map((filters) => ["REQ", makeId(), ...filters]);
      }
    }
    function manageActiveForwardReq(): MonoTypeOperatorFunction<LazyREQ> {
      const recordActiveReq = (req: LazyREQ) => {
        const subId = req[1];
        ongoings.set(subId, {
          req,
          scope,
        });
      };
      const forgetActiveReq = (subId: string) => {
        ongoings.delete(subId);
      };

      return tap({
        next: (req: LazyREQ) => {
          recordActiveReq(req);
        },
        finalize: () => {
          forgetActiveReq(
            makeSubId({
              rxReqId,
            })
          );
        },
      });
    }
    function createEoseManagedEventObservable(
      subId: string
    ): Observable<EventPacket> {
      const eose$ = new Subject<void>();
      const complete$ = new Subject<void>();
      const eoseRelays = new Set<string>();
      const manageCompletion = merge(
        eose$,
        createConnectionStateObservable()
      ).subscribe(() => {
        const status = getAllRelayState();
        const shouldComplete = Object.entries(status).every(
          ([url, state]) =>
            (scope && !scope.includes(url)) ||
            state === "error" ||
            state === "terminated" ||
            (state === "ongoing" && eoseRelays.has(url))
        );
        if (shouldComplete) {
          complete$.next();
        }
      });

      return message$.pipe(
        takeUntil(complete$),
        completeOnTimeout(TIMEOUT),
        filterBySubId(subId),
        filter((e) => !eoseRelays.has(e.from)),
        tap((e) => {
          if (e.message[0] === "EOSE") {
            eoseRelays.add(e.from);
            finalizeReq({ subId, url: e.from });
            eose$.next();
          }
        }),
        pickEvents(),
        finalize(() => {
          finalizeReq({ subId });
          complete$.unsubscribe();
          eose$.unsubscribe();
          manageCompletion.unsubscribe();
        })
      );
    }
    function filterBySubId(
      subId: string
    ): MonoTypeOperatorFunction<MessagePacket> {
      return filter(
        (packet) =>
          (packet.message[0] === "EVENT" || packet.message[0] === "EOSE") &&
          packet.message[1] === subId
      );
    }
    function pickEvents(): OperatorFunction<MessagePacket, EventPacket> {
      return mergeMap(({ from, message }) =>
        message[0] === "EVENT"
          ? of({ from, subId: message[1], event: message[2] })
          : EMPTY
      );
    }
  }
  createAllEventObservable(): Observable<EventPacket> {
    return this.message$
      .asObservable()
      .pipe(
        mergeMap(({ from, message }) =>
          message[0] === "EVENT"
            ? of({ from, subId: message[1], event: message[2] })
            : EMPTY
        )
      );
  }
  createAllErrorObservable(): Observable<ErrorPacket> {
    return this.error$.asObservable();
  }
  createAllMessageObservable(): Observable<MessagePacket> {
    return this.message$.asObservable();
  }
  createConnectionStateObservable(): Observable<ConnectionStatePacket> {
    return this.status$.asObservable();
  }

  send(
    params: Nostr.EventParameters,
    options?: RxNostrSendOptions
  ): Observable<OkPacket> {
    const { seckey, scope: _scope } = makeRxNostrSendOptions(options);
    const scope = _scope?.map(normalizeRelayUrl);

    const writableConns = Array.from(this.connections.values()).filter(
      (conn) => (!scope || scope.includes(conn.url)) && conn.write
    );
    const subject = new ReplaySubject<OkPacket>(writableConns.length);
    let subscription: Subscription | null = null;

    getSignedEvent(params, seckey).then((event) => {
      if (!subject.closed) {
        subscription = this.createAllMessageObservable().subscribe(
          ({ from, message }) => {
            if (message[0] !== "OK") {
              return;
            }
            subject.next({
              from,
              id: event.id,
              ok: message[2],
            });
          }
        );
      }

      for (const conn of writableConns) {
        conn.sendEVENT(["EVENT", event]);
      }
    });

    return subject.pipe(
      take(writableConns.length),
      timeout(30 * 1000),
      finalize(() => {
        subject.complete();
        subject.unsubscribe();
        subscription?.unsubscribe();
      })
    );
  }

  dispose(): void {
    this.message$.complete();
    this.error$.complete();
    for (const conn of this.connections.values()) {
      conn.dispose();
    }
  }

  private ensureReq(
    req: LazyREQ,
    options?: { scope?: string[] | null; overwrite?: boolean }
  ) {
    const scope = options?.scope;
    for (const url of this.connections.keys()) {
      const conn = this.connections.get(url);
      if (!conn || !conn.read || (scope && !scope.includes(url))) {
        continue;
      }

      conn.ensureReq(req, { overwrite: options?.overwrite });
    }
  }

  private finalizeReq(params: { subId?: string; url?: string }) {
    const { subId, url } = params;
    if (subId === undefined && url === undefined) {
      throw new Error();
    }

    if (url) {
      this.connections.get(url)?.finalizeReq(subId);
    } else {
      for (const conn of this.connections.values()) {
        conn.finalizeReq(subId);
      }
    }
  }
}

interface OngoingReq {
  req: LazyREQ;
  scope?: string[];
}

function makeSubId(params: { rxReqId: string; index?: number }): string {
  return `${params.rxReqId}:${params.index ?? 0}`;
}
