import * as Nostr from "nostr-typedef";
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  Observable,
  of,
  Subject,
  Subscription,
  timer,
} from "rxjs";

import type { RetryConfig, RxNostrConfig } from "../config/index.js";
import {
  RxNostrInvalidUsageError,
  RxNostrLogicError,
  RxNostrWebSocketError,
} from "../error.js";
import { Nip11Registry } from "../nip11.js";
import {
  AuthPacket,
  ClosedPacket,
  ConnectionState,
  ConnectionStatePacket,
  EosePacket,
  EventPacket,
  MessagePacket,
  OkPacket,
  OutgoingMessagePacket,
} from "../packet.js";
import {
  ICloseEvent,
  IMessageEvent,
  IWebSocket,
  IWebSocketConstructor,
  ReadyState,
} from "../websocket.js";

export class RelayConnection {
  private socket: IWebSocket | null = null;
  private buffer: Nostr.ToRelayMessage.Any[] = [];
  private unsent: Nostr.ToRelayMessage.Any[] = [];
  private reconnected$ = new Subject<Nostr.ToRelayMessage.Any[]>();
  private outgoing$ = new Subject<OutgoingMessagePacket>();
  private message$ = new Subject<MessagePacket>();
  private error$ = new Subject<unknown>();
  private retryTimer: Subscription | null = null;

  private disposed = false;

  private state$ = new Subject<ConnectionState>();
  private _state: ConnectionState = "initialized";
  get state(): ConnectionState {
    return this._state;
  }
  private setState(state: ConnectionState) {
    this._state = state;
    this.state$.next(state);
  }

  constructor(
    public url: string,
    private config: RxNostrConfig,
  ) {
    // Caching
    if (!config.skipFetchNip11) {
      Nip11Registry.fetch(url);
    }

    this.setState("initialized");
  }

  connectManually() {
    this.connect();
  }
  private connect(retryCount?: number) {
    if (this.state === "terminated") {
      return;
    }

    const isRetry = typeof retryCount === "number";
    const canConnect =
      this.state === "initialized" ||
      this.state === "dormant" ||
      this.state === "error" ||
      this.state === "rejected" ||
      isRetry;
    if (!canConnect) {
      return;
    }

    this.socket = this.createSocket(retryCount ?? 0);
  }
  private createSocket(retryCount: number) {
    const isAutoRetry = retryCount > 0;
    const isManualRetry = this.state === "error" || this.state === "rejected";

    if (isAutoRetry) {
      this.setState("retrying");
    } else {
      this.setState("connecting");
    }

    const onopen = async () => {
      if (this.state === "terminated") {
        socket.close(WebSocketCloseCode.RX_NOSTR_DISPOSED);
        return;
      }

      this.setState("connected");

      if (isAutoRetry || isManualRetry) {
        this.reconnected$.next(this.unsent);
        this.unsent = [];
      }

      try {
        for (const message of this.buffer) {
          this.send(message);
        }
      } catch (err) {
        this.error$.next(err);
      } finally {
        this.buffer = [];
      }
    };
    const onmessage = ({ data }: IMessageEvent) => {
      if (this.state === "terminated") {
        return;
      }

      try {
        this.message$.next(this.pack(JSON.parse(data)));
      } catch (err) {
        this.error$.next(err);
      }
    };
    const onclose = ({ code }: ICloseEvent) => {
      socket.removeEventListener("open", onopen);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      if (this.socket === socket) {
        this.socket = null;
      }

      if (
        this.state === "terminated" ||
        code === WebSocketCloseCode.RX_NOSTR_DISPOSED
      ) {
        this.unsent = [];
        this.buffer = [];
        return;
      }

      if (code === WebSocketCloseCode.RX_NOSTR_IDLE) {
        this.setState("dormant");

        if (this.buffer.length > 0) {
          this.connect();
        }
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.unsent = [];
        this.buffer = [];

        this.error$.next(new RxNostrWebSocketError(code));
        this.setState("rejected");
      } else {
        this.unsent.push(...this.buffer);
        this.buffer = [];

        this.error$.next(new RxNostrWebSocketError(code));

        const nextRetry = retryCount + 1;
        const shouldRetry =
          this.config.retry.strategy !== "off" &&
          nextRetry <= this.config.retry.maxCount;

        if (shouldRetry) {
          this.setState("waiting-for-retrying");

          this.retryTimer?.unsubscribe();
          this.retryTimer = retryTimer(this.config.retry, nextRetry).subscribe(
            () => {
              if (!this.disposed) {
                this.connect(nextRetry);
              }
            },
          );
        } else {
          this.setState("error");
        }
      }
    };

    const WebSocket: IWebSocketConstructor =
      this.config.websocketCtor ?? globalThis.WebSocket;

    if (!WebSocket) {
      throw new RxNostrInvalidUsageError("WebSocket constructor is missing");
    }

    const socket: IWebSocket = new WebSocket(this.url);

    socket.addEventListener("open", onopen);
    socket.addEventListener("message", onmessage);
    socket.addEventListener("close", onclose);

    return socket;
  }
  private pack(message: Nostr.ToClientMessage.Any): MessagePacket {
    const type = message[0];
    const from = this.url;

    switch (type) {
      case "EVENT":
        return {
          from,
          type,
          message,
          subId: message[1],
          event: message[2],
        };
      case "EOSE":
        return {
          from,
          type,
          message,
          subId: message[1],
        };
      case "OK":
        return {
          from,
          type,
          message,
          eventId: message[1],
          ok: message[2],
          notice: message[3],
        };
      case "CLOSED":
        return {
          from,
          type,
          message,
          subId: message[1],
          notice: message[2],
        };
      case "NOTICE":
        return {
          from,
          type,
          message,
          notice: message[1],
        };
      case "AUTH":
        return {
          from,
          type,
          message,
          challenge: message[1],
        };
      case "COUNT":
        return {
          from,
          type,
          message,
          subId: message[1],
          count: message[2],
        };
      default:
        return {
          from,
          type: "unknown",
          message,
        };
    }
  }

  disconnect(code: WebSocketCloseCode): void {
    this.socket?.close(code);
  }

  send(message: Nostr.ToRelayMessage.Any): void {
    switch (this.state) {
      case "terminated":
      case "rejected": {
        return;
      }
      case "initialized":
      case "connecting":
      case "dormant": {
        this.buffer.push(message);
        this.connect();
        return;
      }
      case "connected": {
        if (!this.socket) {
          throw new RxNostrLogicError();
        }

        if (this.socket.readyState === ReadyState.OPEN) {
          this.outgoing$.next({ to: this.url, message });
          this.socket.send(JSON.stringify(message));
        } else {
          this.buffer.push(message);
        }
        return;
      }
      case "waiting-for-retrying":
      case "retrying":
      case "error": {
        this.unsent.push(message);
        return;
      }
    }
  }

  getEVENTObservable(): Observable<EventPacket> {
    return this.message$.pipe(
      filter((p): p is EventPacket => p.type === "EVENT"),
    );
  }
  getEOSEObservable(): Observable<EosePacket> {
    return this.message$.pipe(
      filter((p): p is EosePacket => p.type === "EOSE"),
    );
  }
  getCLOSEDObservable(): Observable<ClosedPacket> {
    return this.message$.pipe(
      filter((p): p is ClosedPacket => p.type === "CLOSED"),
    );
  }
  getOKObservable(): Observable<OkPacket> {
    return this.message$.pipe(filter((p): p is OkPacket => p.type === "OK"));
  }
  getAUTHObservable(): Observable<AuthPacket> {
    return this.message$.pipe(
      filter((p): p is AuthPacket => p.type === "AUTH"),
    );
  }
  getAllMessageObservable(): Observable<MessagePacket> {
    return this.message$.asObservable();
  }

  getOutgoingMessageObservable(): Observable<OutgoingMessagePacket> {
    return this.outgoing$.asObservable();
  }
  getReconnectedObservable(): Observable<Nostr.ToRelayMessage.Any[]> {
    return this.reconnected$.asObservable();
  }
  getConnectionStateObservable(): Observable<ConnectionStatePacket> {
    return this.state$.pipe(
      distinctUntilChanged(),
      map((state) => ({
        from: this.url,
        state,
      })),
    );
  }
  getErrorObservable(): Observable<unknown> {
    return this.error$.asObservable();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.setState("terminated");

    this.retryTimer?.unsubscribe();

    this.socket?.close(WebSocketCloseCode.RX_NOSTR_DISPOSED);
    this.socket = null;

    const subjects = [
      this.state$,
      this.outgoing$,
      this.message$,
      this.error$,
      this.reconnected$,
    ];
    for (const sub of subjects) {
      sub.complete();
    }
  }
}

function retryTimer(config: RetryConfig, count: number) {
  switch (config.strategy) {
    case "exponential": {
      const time = Math.max(
        config.initialDelay * 2 ** (count - 1) + (Math.random() - 0.5) * 1000,
        1000,
      );
      return timer(time);
    }
    case "immediately":
      return of(0);
    case "linear":
      return timer(config.interval);
    case "off":
      return EMPTY;
  }
}

export const WebSocketCloseCode = {
  /**
   * 1006 is a reserved value and MUST NOT be set as a status code in a
   * Close control frame by an endpoint.  It is designated for use in
   * applications expecting a status code to indicate that the
   * connection was closed abnormally, e.g., without sending or
   * receiving a Close control frame.
   *
   * See also: https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1
   */
  ABNORMAL_CLOSURE: 1006,
  /**
   * When a websocket is closed by the relay with a status code 4000
   * that means the client shouldn't try to connect again.
   *
   * See also: https://github.com/nostr-protocol/nips/blob/fab6a21a779460f696f11169ddf343b437327592/01.md?plain=1#L113
   */
  DONT_RETRY: 4000,
  /** @internal rx-nostr uses it internally. */
  RX_NOSTR_IDLE: 4537,
  /** @internal rx-nostr uses it internally. */
  RX_NOSTR_DISPOSED: 4538,
} as const;

type WebSocketCloseCode =
  (typeof WebSocketCloseCode)[keyof typeof WebSocketCloseCode];
