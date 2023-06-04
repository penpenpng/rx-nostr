import normalizeUrl from "normalize-url";
import {
  catchError,
  concat,
  EMPTY,
  filter,
  finalize,
  first,
  groupBy,
  GroupedObservable,
  identity,
  map,
  mergeAll,
  mergeMap,
  MonoTypeOperatorFunction,
  Observable,
  of,
  OperatorFunction,
  pairwise,
  ReplaySubject,
  retry,
  Subject,
  Subscription,
  switchAll,
  take,
  takeUntil,
  tap,
} from "rxjs";
import { webSocket } from "rxjs/webSocket";

import { createEventByNip07, createEventBySecretKey } from "./nostr/event.js";
import type { Nip07 } from "./nostr/nip07.js";
import { Nostr } from "./nostr/primitive.js";
import { completeOnTimeout } from "./operator.js";
import type {
  ConnectionState,
  ConnectionStatePacket,
  ErrorPacket,
  EventPacket,
  MessagePacket,
  OkPacket,
} from "./packet.js";
import type { RxReq } from "./req.js";
import { createSignal, defineDefaultOptions } from "./util.js";

export * from "./nostr/primitive.js";
export * from "./operator.js";
export * from "./packet.js";
export * from "./req.js";

/**
 * The core object of rx-nostr, which holds a connection to relays
 * and manages subscriptions as directed by the RxReq object connected by `use()`.
 * Use `createRxNostr()` to get the object.
 */
export interface RxNostr {
  /**
   * Returns a list of relays used by this object.
   * The relay URLs are normalised so may not match the URLs set.
   */
  getRelays(): Relay[];
  /**
   * Sets the list of relays.
   * If a REQ subscription already exists, the same REQ is issued for the newly added relay
   * and CLOSE is sent for the removed relay.
   */
  setRelays(
    relays: (string | Relay)[] | Awaited<ReturnType<Nip07["getRelays"]>>
  ): void;
  addRelay(relay: string | Relay): void;
  removeRelay(url: string): void;

  getAllRelayState(): Record<string, ConnectionState>;
  getRelayState(url: string): ConnectionState;
  reconnect(url: string): void;

  /**
   * Associate RxReq with RxNostr.
   * When the associated RxReq is manipulated,
   * the RxNostr issues a new REQ to all relays allowed to be read.
   * The method returns an Observable that issues EventPackets
   * when an EVENT is received that is subscribed by RxReq.
   * You can unsubscribe the Observable to CLOSE.
   */
  use(rxReq: RxReq): Observable<EventPacket>;
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
  createConnectionStateObservable(): Observable<ConnectionStatePacket>;

  /**
   * Attempts to send events to all relays that are allowed to write.
   * The `seckey` param accepts both nsec format and hex format,
   * and if omitted NIP-07 will be automatically used.
   */
  send(params: Nostr.EventParameters, seckey?: string): Observable<OkPacket>;

  /**
   * Releases all resources held by the RxNostr object.
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
  /** Used to construct subId. */
  rxNostrId: string;
  /** Number of attempts to reconnect when websocket is disconnected. */
  retry: number;
  /**
   * The time in milliseconds to timeout when following the backward strategy.
   * The observable is terminated when the specified amount of time has elapsed
   * during which no new events are available.
   */
  timeout: number;
}
const defaultRxNostrOptions = defineDefaultOptions({
  rxNostrId: undefined as string | undefined,
  retry: 10,
  timeout: 10000,
});

export interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

let nextRxNostrId = 0;

class RxNostrImpl implements RxNostr {
  private options: RxNostrOptions;
  private relays: Record<string, RelayState> = {};
  private activeReqs: Record<string, Nostr.OutgoingMessage.REQ> = {};
  private message$: Subject<MessagePacket> = new Subject();
  private error$: Subject<ErrorPacket> = new Subject();
  private status$: Subject<ConnectionStatePacket> = new Subject();

  constructor(options?: Partial<RxNostrOptions>) {
    const opt = defaultRxNostrOptions(options);
    this.options = {
      ...opt,
      rxNostrId: opt.rxNostrId ?? `rx-nostr${nextRxNostrId++}`,
    };
  }

  getRelays(): Relay[] {
    return Object.values(this.relays).map(({ url, read, write }) => ({
      url,
      read,
      write,
    }));
  }

  private createWebsocket(url: string): RelayConnection {
    const websocket = webSocket<Nostr.IncomingMessage.Any>(url);

    let state: ConnectionState = "not-started";
    const setState = (s: ConnectionState) => {
      if (state === s) {
        return;
      }
      state = s;
      this.status$.next({
        from: url,
        state,
      });
    };

    const observable = websocket.pipe(
      tap({
        subscribe: () => {
          setState(state === "not-started" ? "starting" : "reconnecting");
        },
        next: () => {
          setState("ongoing");
        },
        complete: () => {
          setState("terminated");
        },
      }),
      retry(this.options.retry),
      catchError((reason: unknown) => {
        this.relays[url].activeSubIds.clear();
        this.error$.next({ from: url, reason });
        setState("error");
        return EMPTY;
      })
    );
    const connect = () => {
      observable.subscribe((message) => {
        this.message$.next({
          from: url,
          message,
        });
      });
    };

    return {
      send: (message) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        websocket.next(message as any);
      },
      ensure: () => {
        if (state === "not-started") {
          setState("not-started");
        }
        if (state === "not-started" || state === "error") {
          connect();
        }
      },
      close: () => {
        websocket.complete();
      },
      reconnect: () => {
        if (state === "error") {
          connect();
        } else {
          throw new Error("reconnect() can be called only in 'error' state");
        }
      },
      getState: () => state,
    };
  }

  setRelays(
    relays: (string | Relay)[] | Awaited<ReturnType<Nip07["getRelays"]>>
  ): void {
    const createWebsocket = this.createWebsocket.bind(this);
    const nextRelays = getNextRelayState(this.relays, relays);

    const prevReadableUrls = this.getReadableUrls();
    const nextReadableUrls = this.getReadableUrls(Object.values(nextRelays));
    const urlsNoLongerRead = subtract(prevReadableUrls, nextReadableUrls);
    for (const url of urlsNoLongerRead) {
      this.finalizeReq({ url });
    }

    const urlsToBeRead = subtract(nextReadableUrls, prevReadableUrls);
    for (const req of Object.values(this.activeReqs)) {
      this.ensureReq(req, {
        relays: urlsToBeRead.map((url) => nextRelays[url]),
      });
    }

    this.relays = nextRelays;
    for (const relay of Object.values(nextRelays)) {
      relay.websocket.ensure();
    }

    // --- scoped untility pure functions ---
    function getNextRelayState(
      prev: Record<string, RelayState>,
      relays: (string | Relay)[] | Awaited<ReturnType<Nip07["getRelays"]>>
    ): Record<string, RelayState> {
      const next: Record<string, RelayState> = {};

      for (const relay of Array.isArray(relays)
        ? relays.map(normalizeRelay)
        : Object.entries(relays).map(([url, flags]) => ({ url, ...flags }))) {
        const url = relay.url;
        const prevState = prev[url];

        const websocket = prevState?.websocket ?? createWebsocket(url);
        const activeSubIds = prevState?.activeSubIds ?? new Set();

        next[relay.url] = {
          ...relay,
          websocket,
          activeSubIds,
        };
      }

      return next;
    }
    function normalizeRelay(urlOrRelay: string | Relay): Relay {
      const relay: Relay =
        typeof urlOrRelay === "string"
          ? {
              url: urlOrRelay,
              read: true,
              write: true,
            }
          : urlOrRelay;
      relay.url = normalizeUrl(relay.url, {
        normalizeProtocol: false,
      });

      return relay;
    }
    function subtract<T>(a: T[], b: T[]): T[] {
      return a.filter((e) => !b.includes(e));
    }
  }
  addRelay(relay: string | Relay): void {
    this.setRelays([...this.getRelays(), relay]);
  }
  removeRelay(url: string): void {
    const currentRelays = this.getRelays();
    const nextRelays = currentRelays.filter((relay) => relay.url !== url);
    if (currentRelays.length !== nextRelays.length) {
      this.setRelays(nextRelays);
    }
  }

  getAllRelayState(): Record<string, ConnectionState> {
    return Object.fromEntries(
      Object.values(this.relays).map((e) => [e.url, this.getRelayState(e.url)])
    );
  }
  getRelayState(url: string): ConnectionState {
    const relay = this.relays[url];
    if (!relay) {
      throw new Error("Relay not found");
    }
    // this.relays[url] may be set before this.relays[url].websocket is initialized
    return relay.websocket?.getState() ?? "not-started";
  }
  reconnect(url: string): void {
    return this.relays[url].websocket?.reconnect();
  }

  use(rxReq: RxReq): Observable<EventPacket> {
    const TIMEOUT = this.options.timeout;
    const strategy = rxReq.strategy;
    const rxNostrId = this.options.rxNostrId;
    const rxReqId = rxReq.rxReqId;

    const ensureReq = this.ensureReq.bind(this);
    const finalizeReq = this.finalizeReq.bind(this);
    const recordActiveReq = (req: Nostr.OutgoingMessage.REQ) => {
      const subId = req[1];
      this.activeReqs[subId] = req;
    };
    const forgetActiveReq = (subId: string) => {
      delete this.activeReqs[subId];
    };
    const getReadableRelayCount = () => this.getReadableUrls().length;

    const createSubEvent$ = (
      subId: string
    ): [Observable<EventPacket>, () => void] => {
      const readableRelays = getReadableRelayCount();
      const [signal$, sendSignal] = createSignal();

      return [
        this.message$.pipe(
          filterBySubId(subId),
          groupByRelay(),
          strategy === "oneshot" ? take(readableRelays) : takeUntil(signal$),
          mergeMap((relayMessage$) => {
            const url = relayMessage$.key;
            return createRelaySubEvent$({
              message$: relayMessage$,
              completeOnEose: strategy !== "forward",
              url,
              subId,
            }).pipe(
              strategy !== "forward" ? completeOnTimeout(TIMEOUT) : identity,
              strategy !== "forward"
                ? finalize(() => {
                    finalizeReq({ subId, url });
                  })
                : identity
            );
          })
        ),
        sendSignal,
      ];
    };

    // TODO
    const x = rxReq.getReqObservable().pipe(
      filter((filters): filters is Nostr.Filter[] => filters !== null),
      attachSubId(),
      tap({
        next: (req) => {
          if (strategy === "forward") {
            recordActiveReq(req);
          }
          ensureReq(req, { overwrite: strategy === "forward" });
        },
        finalize: () => {
          if (strategy === "forward") {
            forgetActiveReq(
              makeSubId({
                rxNostrId,
                rxReqId,
              })
            );
          }
        },
      }),
      strategy === "oneshot" ? first() : identity,
      map(([, subId]) => createSubEvent$(subId))
    );

    return concat(of(null), x).pipe(
      pairwise(),
      tap(([prev]) => {
        if (prev !== null) {
          prev[1]();
        }
      }),
      // TODO
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      map(([, next]) => next![0]),
      strategy === "forward" ? switchAll() : mergeAll(),
      strategy === "forward"
        ? finalize(() => {
            finalizeReq({
              subId: makeSubId({
                rxNostrId,
                rxReqId,
              }),
            });
          })
        : identity
    );

    function createRelaySubEvent$(params: {
      url: string;
      subId: string;
      message$: Observable<MessagePacket>;
      completeOnEose?: boolean;
    }): Observable<EventPacket> {
      const { url, subId, message$, completeOnEose } = params;

      return new Observable<EventPacket>((observer) => {
        const sub = message$.subscribe({
          next: ({ message }) => {
            const type = message[0];

            if (type === "EVENT") {
              observer.next({
                from: url,
                subId,
                event: message[2],
              });
            } else if (type === "EOSE" && completeOnEose) {
              observer.complete();
            }
          },
          complete: () => {
            observer.complete();
          },
          error: (err) => {
            observer.error(err);
          },
        });

        return () => {
          sub.unsubscribe();
        };
      });
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
    function groupByRelay(): OperatorFunction<
      MessagePacket,
      GroupedObservable<string, MessagePacket>
    > {
      return groupBy(({ from }) => from);
    }
    function attachSubId(): OperatorFunction<
      Nostr.Filter[],
      Nostr.OutgoingMessage.REQ
    > {
      const makeId = (index?: number) =>
        makeSubId({ rxNostrId, rxReqId, index });

      switch (strategy) {
        case "backward":
          return map((filters, index) => ["REQ", makeId(index), ...filters]);
        case "forward":
        case "oneshot":
          return map((filters) => ["REQ", makeId(), ...filters]);
      }
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
    seckey?: string | undefined
  ): Observable<OkPacket> {
    const urls = this.getWritableUrls();
    const subject = new ReplaySubject<OkPacket>(urls.length);
    let subscription: Subscription | null = null;

    (seckey
      ? Promise.resolve(createEventBySecretKey(params, seckey))
      : createEventByNip07(params)
    ).then((event) => {
      if (!subject.closed) {
        subscription = this.createAllMessageObservable().subscribe(
          ({ from, message }) => {
            if (message[0] !== "OK") {
              return;
            }
            subject.next({
              from,
              id: event.id,
            });
          }
        );
      }

      for (const url of urls) {
        this.relays[url].websocket.send(["EVENT", event]);
      }
    });

    return subject.pipe(
      take(urls.length),
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
    for (const relay of Object.values(this.relays)) {
      relay.websocket.close();
    }
  }

  private ensureReq(
    req: Nostr.OutgoingMessage.REQ,
    options?: { relays?: RelayState[]; overwrite?: boolean }
  ) {
    const subId = req[1];

    for (const relay of options?.relays ?? Object.values(this.relays)) {
      if (
        !relay.read ||
        (!options?.overwrite && relay.activeSubIds.has(subId))
      ) {
        continue;
      }

      relay.websocket.send(req);
      relay.activeSubIds.add(subId);
    }
  }

  private finalizeReq(params: { subId?: string; url?: string }) {
    const { subId, url } = params;
    if (subId === undefined && url === undefined) {
      throw new Error();
    }

    const relays = url ? [this.relays[url]] : Object.values(this.relays);
    for (const relay of relays) {
      const subIds = subId ? [subId] : Array.from(relay.activeSubIds);
      for (const subId of subIds) {
        if (relay.activeSubIds.has(subId)) {
          relay.websocket.send(["CLOSE", subId]);
        }
        relay.activeSubIds.delete(subId);
      }
    }
  }

  private getReadableUrls(relays?: Relay[]): string[] {
    return (relays ?? Object.values(this.relays))
      .filter((e) => e.read)
      .map((e) => e.url);
  }
  private getWritableUrls(relays?: Relay[]): string[] {
    return (relays ?? Object.values(this.relays))
      .filter((e) => e.write)
      .map((e) => e.url);
  }
}

interface RelayState {
  url: string;
  read: boolean;
  write: boolean;
  activeSubIds: Set<string>;
  websocket: RelayConnection;
}

interface RelayConnection {
  send: (message: Nostr.OutgoingMessage.Any) => void;
  ensure: () => void;
  close: () => void;
  reconnect: () => void;
  getState: () => ConnectionState;
}

function makeSubId(params: {
  rxNostrId: string;
  rxReqId: string;
  index?: number;
}): string {
  return `${params.rxNostrId}:${params.rxReqId}:${params.index ?? 0}`;
}
