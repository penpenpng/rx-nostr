import Nostr from "nostr-typedef";
import {
  distinctUntilChanged,
  EMPTY,
  filter,
  Observable,
  of,
  retry,
  Subject,
  Subscription,
  timer,
} from "rxjs";

import type { RetryConfig, RxNostrConfig } from "../config.js";
import { RxNostrLogicError, RxNostrWebSocketError } from "../error.js";
import { Nip11Registry } from "../nip11.js";
import { ConnectionState } from "../packet.js";

export class RelayConnection {
  private socket: WebSocket | null = null;
  private buffer: Nostr.ToRelayMessage.Any[] = [];
  private unsent: Nostr.ToRelayMessage.Any[] = [];
  private reconnected$ = new Subject<Nostr.ToRelayMessage.Any[]>();
  private message$ = new Subject<Nostr.ToClientMessage.Any>();
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

  constructor(public url: string, private config: RxNostrConfig) {
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
      this.state === "closed" ||
      this.state === "error" ||
      this.state === "rejected" ||
      isRetry;
    if (!canConnect) {
      return;
    }

    if (isRetry) {
      this.setState("reconnecting");
    } else {
      this.setState("connecting");
    }

    this.socket = this.createSocket(retryCount ?? 0);
  }
  private createSocket(retryCount: number) {
    const onopen = () => {
      if (this.state === "terminated") {
        socket.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
        return;
      }

      this.setState("connected");

      if (retryCount) {
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
    const onmessage = ({ data }: MessageEvent) => {
      if (this.state === "terminated") {
        return;
      }

      try {
        this.message$.next(JSON.parse(data));
      } catch (err) {
        this.error$.next(err);
      }
    };
    const onclose = ({ code }: CloseEvent) => {
      socket.removeEventListener("open", onopen);
      socket.removeEventListener("message", onmessage);
      socket.removeEventListener("close", onclose);
      if (this.socket === socket) {
        this.socket = null;
      }

      if (
        this.state === "terminated" ||
        code === WebSocketCloseCode.DISPOSED_BY_RX_NOSTR
      ) {
        return;
      }

      if (code === WebSocketCloseCode.DESIRED_BY_RX_NOSTR) {
        // TODO: unsent と buffer に何か残っている場合は再送を試みる
        this.unsent = [];
        this.buffer = [];

        this.setState("closed");
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.unsent = [];
        this.buffer = [];

        this.setState("rejected");
        this.error$.next(new RxNostrWebSocketError(code));
      } else {
        const nextRetry = retryCount + 1;
        const shouldRetry =
          this.config.retry.strategy !== "off" &&
          nextRetry <= this.config.retry.maxCount;

        if (shouldRetry) {
          this.unsent.push(...this.buffer);
          this.buffer = [];

          this.setState("waiting-for-reconnection");

          this.retryTimer?.unsubscribe();
          this.retryTimer = retryTimer(this.config.retry, nextRetry).subscribe(
            () => {
              if (!this.disposed) {
                this.connect(nextRetry);
              }
            }
          );
        } else {
          this.unsent = [];
          this.buffer = [];

          this.setState("error");
        }

        this.error$.next(new RxNostrWebSocketError(code));
      }
    };

    const socket = new WebSocket(this.url);

    socket.addEventListener("open", onopen);
    socket.addEventListener("message", onmessage);
    socket.addEventListener("close", onclose);

    return socket;
  }

  disconnect(): void {
    this.socket?.close(WebSocketCloseCode.DESIRED_BY_RX_NOSTR);
  }

  send(message: Nostr.ToRelayMessage.Any): void {
    switch (this.state) {
      case "terminated":
      case "rejected": {
        return;
      }
      case "initialized":
      case "connecting":
      case "closed": {
        this.buffer.push(message);
        this.connect();
        return;
      }
      case "connected": {
        if (!this.socket) {
          throw new RxNostrLogicError();
        }

        if (this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify(message));
        } else {
          this.unsent.push(message);
        }
        return;
      }
      case "waiting-for-reconnection":
      case "reconnecting":
      case "error": {
        this.unsent.push(message);
        return;
      }
    }
  }

  getEVENTObservable(): Observable<Nostr.ToClientMessage.EVENT> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.EVENT => msg[0] === "EVENT")
    );
  }
  getEOSEObservable(): Observable<Nostr.ToClientMessage.EOSE> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.EOSE => msg[0] === "EOSE")
    );
  }
  getOKObservable(): Observable<Nostr.ToClientMessage.OK> {
    return this.message$.pipe(
      filter((msg): msg is Nostr.ToClientMessage.OK => msg[0] === "OK")
    );
  }
  getOtherObservable(): Observable<Nostr.ToClientMessage.Any> {
    return this.message$.pipe(
      filter(([type]) => type !== "EVENT" && type !== "EOSE" && type !== "OK")
    );
  }

  getReconnectedObservable(): Observable<Nostr.ToRelayMessage.Any[]> {
    return this.reconnected$.asObservable();
  }
  getConnectionStateObservable(): Observable<ConnectionState> {
    return this.state$.pipe(distinctUntilChanged());
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

    this.socket?.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
    this.socket = null;

    const subjects = [
      this.state$,
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
        1000
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
  DESIRED_BY_RX_NOSTR: 4537,
  /** @internal rx-nostr uses it internally. */
  DISPOSED_BY_RX_NOSTR: 4538,
} as const;
