import {
  catchError,
  EMPTY,
  ErrorNotification,
  filter,
  from,
  map,
  merge,
  mergeAll,
  Observable,
  retry,
  share,
  Subject,
  Subscription,
  switchAll,
} from "rxjs";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";

import { createEventByNip07, createEventBySecretKey } from "./nostr/event";
import { Nostr } from "./nostr/primitive";
import { ObservableReq, ReqQuery } from "./req";
import { AnyMessageNotification, EventMessageNotification } from "./type";

export interface RelaysOptions {
  /**
   * Default value is 10.
   * Number of attempts to reconnect if the WebSocket disconnects unexpectedly.
   */
  retry?: number;
  // EOSE で閉じるときだけ
  timeout?: number;
}

const DEFAULT_RELAYS_OPTIONS: Required<RelaysOptions> = {
  retry: 10,
};

export class Relays {
  private conns: {
    websocket: WebSocketSubject<Nostr.IncomingMessage.Any>;
    url: string;
  }[];
  private options: Required<RelaysOptions>;
  private message$: Observable<AnyMessageNotification>;
  private error$: Subject<ErrorNotification>;
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

  observeAllMessage(): Observable<AnyMessageNotification> {
    return from(this.message$);
  }

  observeAllError(): Observable<ErrorNotification> {
    return from(this.error$);
  }

  observe(req$: ObservableReq): Observable<EventMessageNotification> {
    const multiplex = (req: ReqQuery) =>
      new Observable<EventMessageNotification>((observer) => {
        this.sendMessage(["REQ", req.subId, ...req.filters]);

        const subscription = this.message$.subscribe({
          next: (noti) => {
            const type = noti.message[0];
            if (type === "EVENT") {
              observer.next(noti as EventMessageNotification);
            } else if (type === "EOSE" && req$.strategy === "until-eose") {
              observer.complete();
            }
          },
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });

        return () => {
          this.sendMessage(["CLOSE", req.subId]);
          subscription.unsubscribe();
        };
      });

    return req$.observable.pipe(
      filter((req) => req.filters.length > 0),
      map(multiplex),
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
