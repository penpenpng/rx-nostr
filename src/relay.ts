import {
  Observable,
  retry,
  map,
  merge,
  catchError,
  switchAll,
  takeWhile,
  identity,
  EMPTY,
  filter,
  Subscription,
  Subject,
  share,
  from,
  mergeAll,
} from "rxjs";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";

import { Nostr } from "./nostr/primitive";
import { createEventBySecretKey, createEventByNip07 } from "./nostr/event";
import { ObservableReq, Req } from "./req";

export interface RelaysOptions {
  /**
   * Default value is 10.
   * Number of attempts to reconnect if the WebSocket disconnects unexpectedly.
   */
  retry?: number;
}

const DEFAULT_RELAYS_OPTIONS: Required<RelaysOptions> = {
  retry: 10,
};

export namespace RelayNotification {
  export interface Message<
    M extends Nostr.IncomingMessage.Any = Nostr.IncomingMessage.Any
  > {
    from: string;
    message: M;
  }

  export interface Error {
    from: string;
    error: unknown;
  }
}

export class Relays {
  private conns: {
    websocket: WebSocketSubject<Nostr.IncomingMessage.Any>;
    url: string;
  }[];
  private options: Required<RelaysOptions>;
  private message$: Observable<RelayNotification.Message>;
  private error$: Subject<RelayNotification.Error>;
  private keeping: Subscription;

  constructor(urls: string[], options?: RelaysOptions) {
    this.conns = urls.map((url) => ({ url, websocket: webSocket(url) }));
    this.options = {
      retry: options?.retry ?? DEFAULT_RELAYS_OPTIONS.retry,
    };

    this.error$ = new Subject();
    this.message$ = merge(
      ...this.conns.map(({ websocket, url }) =>
        websocket.pipe(
          retry(this.options.retry),
          map((message) => ({
            from: url,
            message,
          })),
          catchError((error) => {
            this.error$.next({ from: url, error });
            return EMPTY;
          })
        )
      )
    ).pipe(share());

    // To keep alive error$
    this.keeping = this.message$.subscribe();
  }

  observeMessage(): Observable<RelayNotification.Message> {
    return from(this.message$);
  }

  observeError(): Observable<RelayNotification.Error> {
    return from(this.error$);
  }

  observeReq(
    req$: ObservableReq
  ): Observable<RelayNotification.Message<Nostr.IncomingMessage.EVENT>> {
    const observe = (req: Req) => {
      const streams = this.conns.map(({ websocket, url }) =>
        websocket
          .multiplex(
            (): Nostr.OutgoingMessage.REQ => ["REQ", req.subId, ...req.filters],
            (): Nostr.OutgoingMessage.CLOSE => ["CLOSE", req.subId],
            ([type, maybeSubId]: Nostr.IncomingMessage.Any) =>
              (type === "EVENT" || type === "EOSE") && maybeSubId === req.subId
          )
          .pipe(
            req$.strategy === "until-eose"
              ? takeWhile(([type]) => type !== "EOSE")
              : identity,
            filter(
              (message): message is Nostr.IncomingMessage.EVENT =>
                message[0] === "EVENT"
            ),
            map((message) => ({
              from: url,
              message,
            })),
            catchError(() => EMPTY)
          )
      );
      return merge(...streams);
    };

    return req$.observable.pipe(
      filter((req) => req.filters.length > 0),
      map(observe),
      req$.strategy === "until-eose" ? mergeAll() : switchAll()
    );
  }

  /**
   * Broadcast the event with created_at set to the current time.
   * If no seckey is provided, try to use NIP-07 interface.
   */
  async send(params: Nostr.EventParameters, seckey?: string) {
    const event = seckey
      ? createEventBySecretKey(params, seckey)
      : await createEventByNip07(params);

    this.sendMessage(["EVENT", event]);
  }

  disposeErrorStream() {
    this.keeping.unsubscribe();
    this.error$.complete();
  }

  private sendMessage(message: Nostr.OutgoingMessage.Any) {
    for (const { websocket } of this.conns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      websocket.next(message as any);
    }
  }
}
