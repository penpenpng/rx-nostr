import normalizeUrl from "normalize-url";
import {
  catchError,
  EMPTY,
  filter,
  finalize,
  first,
  map,
  mergeAll,
  mergeMap,
  Observable,
  of,
  OperatorFunction,
  pipe,
  retry,
  Subject,
  switchAll,
  tap,
  throwError,
  timeout,
  TimeoutError,
} from "rxjs";
import { webSocket } from "rxjs/webSocket";

import { toHex } from "./nostr/bech32";
import { createEventByNip07, createEventBySecretKey } from "./nostr/event";
import type { Nip07 } from "./nostr/nip07";
import { Nostr } from "./nostr/primitive";
import type { ErrorPacket, EventPacket, MessagePacket } from "./packet";
import type { RxReq, RxReqStrategy } from "./req";
import { defineDefaultOptions } from "./util";

export * from "./nostr/primitive";
export * from "./operator";
export * from "./packet";
export * from "./req";

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

  /**
   * Attempts to send events to all relays that are allowed to write.
   * The `seckey` param accepts both nsec format and hex format,
   * and if omitted NIP-07 will be automatically used.
   */
  send(params: Nostr.EventParameters, seckey?: string): Promise<void>;

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
  setRelays(
    relays: (string | Relay)[] | Awaited<ReturnType<Nip07["getRelays"]>>
  ): void {
    const createWebsocket = (url: string): RelayConnection => {
      const websocket = webSocket<Nostr.IncomingMessage.Any>(url);

      websocket
        .pipe(
          retry(this.options.retry),
          catchError((reason: unknown) => {
            this.relays[url].activeSubIds.clear();
            this.error$.next({ from: url, reason });
            return EMPTY;
          })
        )
        .subscribe((message) => {
          this.message$.next({
            from: url,
            message,
          });
        });

      return {
        send: (message) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          websocket.next(message as any);
        },
        close: () => {
          websocket.complete();
        },
      };
    };

    const nextRelays = getNextRelayState(this.relays, relays);

    const prevReadableUrls = getReadableUrls(Object.values(this.relays));
    const nextReadableUrls = getReadableUrls(Object.values(nextRelays));
    const urlsNoLongerRead = subtract(prevReadableUrls, nextReadableUrls);
    for (const url of urlsNoLongerRead) {
      this.finalizeReqByRelayUrl(url);
    }

    const urlsToBeRead = subtract(nextReadableUrls, prevReadableUrls);
    for (const req of Object.values(this.activeReqs)) {
      this.ensureReq(
        req,
        urlsToBeRead.map((url) => nextRelays[url])
      );
    }

    this.relays = nextRelays;

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
    function getReadableUrls(relays: Relay[]): string[] {
      return relays.filter((e) => e.read).map((e) => e.url);
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

  use(rxReq: RxReq): Observable<EventPacket> {
    const TIMEOUT = this.options.timeout;

    const toEventObservable = (
      subId: string,
      options?: {
        completeOnEose?: boolean;
      }
    ): Observable<EventPacket> => {
      return new Observable<EventPacket>((observer) => {
        const sub = this.message$.subscribe({
          next: (packet) => {
            const [type] = packet.message;

            if (type === "EVENT" && packet.message[1] === subId) {
              rxReq.onReceiveEvent?.(packet.message[2]);
              observer.next({
                from: packet.from,
                subId: packet.message[1],
                event: packet.message[2],
              });
            }
            if (type === "EOSE" && packet.message[1] === subId) {
              if (options?.completeOnEose) {
                this.finalizeReq(subId, packet.from);
                // TODO: 複数リレーあるときにバグるからだめ → url で groupBy したそれぞれを complete する
                observer.complete();
              }
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
    };

    return rxReq.getReqObservable().pipe(
      filter((filters): filters is Nostr.Filter[] => filters !== null),
      attachSubId({
        rxNostrId: this.options.rxNostrId,
        rxReqId: rxReq.rxReqId,
        strategy: rxReq.strategy,
      }),
      tap({
        next: (req) => {
          if (rxReq.strategy === "forward") {
            this.activeReqs[req[1]] = req;
          }
          this.ensureReq(req);
        },
        finalize: () => {
          if (rxReq.strategy === "forward") {
            // FIXME
            delete this.activeReqs[
              `${this.options.rxNostrId}:${rxReq.rxReqId}:0`
            ];
          }
        },
      }),
      toEvent(rxReq.strategy, (subId) => this.finalizeReqBySubId(subId))
    );

    function attachSubId(params: {
      rxNostrId: string;
      rxReqId: string;
      strategy: RxReqStrategy;
    }): OperatorFunction<Nostr.Filter[], Nostr.OutgoingMessage.REQ> {
      const makeId = (index?: number) =>
        `${params.rxNostrId}:${params.rxReqId}:${index ?? 0}`;

      switch (params.strategy) {
        case "backward":
          return map((filters, index) => ["REQ", makeId(index), ...filters]);
        case "forward":
        case "oneshot":
          return map((filters) => ["REQ", makeId(), ...filters]);
      }
    }
    function toEvent(
      strategy: RxReqStrategy,
      finalizeReqBySubId: (subId: string) => void
    ): OperatorFunction<Nostr.OutgoingMessage.REQ, EventPacket> {
      if (strategy === "backward") {
        return pipe(
          map((req) =>
            toEventObservable(req[1], { completeOnEose: true }).pipe(
              timeout(TIMEOUT),
              catchError((error) => {
                if (error instanceof TimeoutError) {
                  return EMPTY;
                } else {
                  return throwError(() => error);
                }
              }),
              finalize(() => {
                finalizeReqBySubId(req[1]);
              })
            )
          ),
          mergeAll()
        );
      } else if (strategy === "forward") {
        let subId: string | null = null;
        return pipe(
          tap((req) => {
            subId ??= req[1];
          }),
          map((req) => toEventObservable(req[1])),
          switchAll(),
          finalize(() => {
            if (subId !== null) {
              finalizeReqBySubId(subId);
            }
          })
        );
      } else if (strategy === "oneshot") {
        return pipe(
          first(),
          map((req) =>
            toEventObservable(req[1], {
              completeOnEose: true,
            }).pipe(
              finalize(() => {
                finalizeReqBySubId(req[1]);
              })
            )
          ),
          mergeAll()
        );
      } else {
        throw new Error("Not Implemented");
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

  async send(
    params: Nostr.EventParameters,
    seckey?: string | undefined
  ): Promise<void> {
    const sechex = seckey?.startsWith("nsec1") ? toHex(seckey) : seckey;
    if (params.pubkey.startsWith("npub1")) {
      params.pubkey = toHex(params.pubkey);
    }

    const event = sechex
      ? createEventBySecretKey(params, sechex)
      : await createEventByNip07(params);

    for (const relay of Object.values(this.relays)) {
      if (relay.write) {
        relay.websocket.send(["EVENT", event]);
      }
    }
  }

  dispose(): void {
    this.message$.complete();
    this.error$.complete();
    for (const relay of Object.values(this.relays)) {
      relay.websocket.close();
    }
  }

  private ensureReq(req: Nostr.OutgoingMessage.REQ, relays?: RelayState[]) {
    const subId = req[1];

    for (const relay of relays ?? Object.values(this.relays)) {
      if (!relay.read || relay.activeSubIds.has(subId)) {
        continue;
      }

      relay.websocket.send(req);
      relay.activeSubIds.add(subId);
    }
  }

  private finalizeReqBySubId(subId: string) {
    for (const relay of Object.values(this.relays)) {
      if (relay.activeSubIds.has(subId)) {
        relay.websocket.send(["CLOSE", subId]);
      }
      relay.activeSubIds.delete(subId);
    }
  }
  private finalizeReqByRelayUrl(url: string) {
    const relay = this.relays[url];
    if (!relay) {
      return;
    }
    for (const subId of relay.activeSubIds) {
      relay.websocket.send(["CLOSE", subId]);
    }
    relay.activeSubIds.clear();
  }
  private finalizeReq(subId: string, url: string) {
    const relay = this.relays[url];
    if (!relay) {
      return;
    }
    if (relay.activeSubIds.has(subId)) {
      relay.websocket.send(["CLOSE", subId]);
      relay.activeSubIds.delete(subId);
    }
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
  close: () => void;
}
