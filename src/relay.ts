import {
  Observable,
  retry,
  map,
  merge,
  catchError,
  of,
  switchAll,
  isObservable,
  takeWhile,
  identity,
  EMPTY,
  filter,
  Subscription,
} from "rxjs";
import { webSocket, WebSocketSubject } from "rxjs/webSocket";

import { Nostr } from "./nostr/primitive";
import { createEventBySecretKey, createEventByNip07 } from "./nostr/event";
import { Req } from "./req";

export interface RelayMessageEvent<
  T extends Nostr.IncomingMessage.Any = Nostr.IncomingMessage.Any
> {
  kind: "message";
  from: string;
  message: T;
}

export interface RelayError {
  kind: "error";
  from: string;
  error: unknown;
}

export type RelayReqMessageEvent =
  RelayMessageEvent<Nostr.IncomingMessage.EVENT>;

export interface RelaysOptions {
  /**
   * Default value is 10.
   * Number of attempts to reconnect if the WebSocket disconnects unexpectedly.
   */
  retry?: number;
  /**
   * Default value is `true`.
   * If true, try to keep the WebSocket connections until `free()` is called.
   * If the `Relay`s are also owned by other `Relays`,
   * the connections keep unless `free()` called by all other `Relays`.
   */
  keepConnections?: boolean;
}

export interface ReqOptions {
  /**
   * If true, whenever receiving an EOSE from a relay, CLOSE will be sent to the relay.
   * The observable is completed when all REQs have been closed.
   */
  untilEose?: boolean;
  /**
   * The behaviour when an error occurs in any of the relay connections.
   * - `send_relay_error` (default): Send `RelayError` event.
   * - `throw`: Raises an error and halts the entire observable.
   * - `silence`: Quietly fails. The observable keeps alive as long as any relay connection is alive.
   */
  onError?: "send_relay_error" | "throw" | "silence";
}

export class Relays {
  private options: Required<RelaysOptions>;
  private holdings: Subscription[] = [];

  constructor(public relays: Relay[], options?: RelaysOptions) {
    this.options = {
      retry: options?.retry ?? 10,
      keepConnections: options?.keepConnections ?? true,
    };

    if (this.options.keepConnections) {
      this.holdings = relays.map((relay) => relay.subject.subscribe());
    }
  }

  /**
   * Subscribe to all messages being received via WebSocket.
   */
  observe(): Observable<RelayMessageEvent | RelayError>;
  observe(
    options?: ReqOptions & { onError: "throw" | "silence" }
  ): Observable<RelayMessageEvent>;
  observe(options?: ReqOptions): Observable<RelayMessageEvent | RelayError>;
  observe(
    options?: Pick<ReqOptions, "onError">
  ): Observable<RelayMessageEvent | RelayError> {
    const { onError } = this.fillReqOptions(options);

    const observables = this.relays.map(({ subject, url }) =>
      subject.pipe(
        retry(this.options?.retry),
        map(
          (message) =>
            ({
              kind: "message" as const,
              from: url,
              message,
            } as RelayMessageEvent)
        ),
        onError === "throw"
          ? identity
          : catchError((error) =>
              onError === "silence"
                ? EMPTY
                : of({ kind: "error" as const, from: url, error })
            )
      )
    );

    return merge(...observables);
  }

  /**
   * Publish an REQ and subscribe to the corresponding message.
   */
  observeReq(req: Req): Observable<RelayReqMessageEvent | RelayError>;
  observeReq(
    req: Req,
    options?: ReqOptions & { onError: "throw" | "silence" }
  ): Observable<RelayReqMessageEvent>;
  observeReq(
    req: Req,
    options?: ReqOptions
  ): Observable<RelayReqMessageEvent | RelayError>;
  observeReq(
    { subId, filters }: Req,
    options?: ReqOptions
  ): Observable<RelayReqMessageEvent | RelayError> {
    const filledOptions = this.fillReqOptions(options);

    if (isObservable(filters)) {
      return filters.pipe(
        map((filters) =>
          this.createReqObservable(["REQ", subId, ...filters], filledOptions)
        ),
        switchAll()
      );
    } else {
      return this.createReqObservable(
        ["REQ", subId, ...filters],
        filledOptions
      );
    }
  }

  private createReqObservable(
    req: Nostr.OutgoingMessage.REQ,
    options: Required<ReqOptions>
  ): Observable<RelayReqMessageEvent | RelayError> {
    const subId = req[1];
    const observables = this.relays.map(({ subject, url }) =>
      subject
        .multiplex(
          () => req,
          () => ["CLOSE", subId],
          ([type, maybeSubId]) =>
            (type === "EVENT" || type === "EOSE") && maybeSubId === subId
        )
        .pipe(
          retry(this.options?.retry),
          options?.untilEose
            ? takeWhile(([type]) => type === "EVENT")
            : identity,
          filter(([type]) => type === "EVENT"),
          map(
            (message) =>
              ({
                kind: "message" as const,
                from: url,
                message,
                /* The above filter() ensures the event type. */
              } as RelayReqMessageEvent)
          ),
          options.onError === "throw"
            ? identity
            : catchError((error) =>
                options.onError === "silence"
                  ? EMPTY
                  : of({ kind: "error" as const, from: url, error })
              )
        )
    );

    return merge(...observables);
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

  private sendMessage(message: Nostr.OutgoingMessage.Any) {
    for (const relay of this.relays) {
      relay.subject.next(message as any);
    }
  }

  free() {
    for (const sub of this.holdings) {
      sub.unsubscribe();
    }
    this.holdings = [];
  }

  private fillReqOptions(options?: ReqOptions): Required<ReqOptions> {
    const { untilEose = false, onError = "send_relay_error" } = options ?? {};
    return { untilEose, onError };
  }
}

export class Relay {
  /** @internal */
  subject: WebSocketSubject<Nostr.IncomingMessage.Any>;

  constructor(public url: string) {
    this.subject = webSocket(url);
  }
}
