import Nostr from "nostr-typedef";
import {
  EMPTY,
  identity,
  mergeMap,
  Observable,
  ObservableInput,
  of,
  retry,
  Subject,
  tap,
  timer,
} from "rxjs";

import { ConnectionState, MessagePacket } from "./packet";

export class RxNostrWebSocket {
  private socket: WebSocket | null = null;
  private message$ = new Subject<MessagePacket | WebSocketError>();
  private error$ = new Subject<unknown>();
  private connectionState$ = new Subject<ConnectionState>();
  private connectionState: ConnectionState = "not-started";
  private queuedEvents: Nostr.ToRelayMessage.EVENT[] = [];
  private reqs: Map<string /* subId */, Nostr.ToRelayMessage.REQ> = new Map();

  constructor(public url: string, private backoffConfig: BackoffConfig) {
    this.connectionState$.next("not-started");
  }

  private setConnectionState(state: ConnectionState) {
    if (this.connectionState === "terminated") {
      return;
    }

    this.connectionState = state;
    this.connectionState$.next(state);
  }

  start() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return Promise.resolve();
    }

    let resolve: () => void;
    const resolveOnOpen = new Promise<void>((_resolve) => {
      resolve = _resolve;
    });

    const onopen = () => {
      this.setConnectionState("ongoing");
      resolve();
      for (const event of this.queuedEvents) {
        this.send(event);
      }
      this.queuedEvents = [];
      for (const req of this.reqs.values()) {
        this.send(req);
      }
    };
    const onmessage = ({ data }: MessageEvent) => {
      if (this.connectionState === "terminated") {
        return;
      }
      try {
        this.message$.next({ from: this.url, message: JSON.parse(data) });
      } catch (err) {
        this.error$.next(err);
      }
    };
    const onclose = ({ code }: CloseEvent) => {
      if (
        code === WebSocketCloseCode.DISPOSED_BY_RX_NOSTR ||
        this.connectionState === "terminated"
      ) {
        return;
      }

      websocket.removeEventListener("open", onopen);
      websocket.removeEventListener("message", onmessage);
      websocket.removeEventListener("close", onclose);

      if (code === WebSocketCloseCode.DESIRED_BY_RX_NOSTR) {
        this.setConnectionState("not-started");
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.setConnectionState("rejected");
        this.message$.next(new WebSocketError(code));
      } else {
        this.message$.next(new WebSocketError(code));
      }
    };

    const websocket = new WebSocket(this.url);

    websocket.addEventListener("open", onopen);
    websocket.addEventListener("message", onmessage);
    websocket.addEventListener("close", onclose);

    this.socket = websocket;

    return resolveOnOpen;
  }

  stop() {
    this.socket?.close(WebSocketCloseCode.DESIRED_BY_RX_NOSTR);
  }

  getConnectionState() {
    return this.connectionState;
  }

  getMessageObservable(): Observable<MessagePacket> {
    return this.message$.asObservable().pipe(
      tap((data) => {
        if (
          data instanceof WebSocketError &&
          data.code !== WebSocketCloseCode.DONT_RETRY
        ) {
          this.start();
        }
      }),
      mergeMap((data) => {
        if (data instanceof WebSocketError) {
          if (data.code === WebSocketCloseCode.DONT_RETRY) {
            return EMPTY;
          } else {
            throw data;
          }
        } else {
          return of(data);
        }
      }),
      tap({
        subscribe: () => {
          if (this.connectionState === "not-started") {
            this.setConnectionState("starting");
          } else {
            this.setConnectionState("reconnecting");
          }

          this.start();
        },
      }),
      this.backoffConfig.strategy === "off"
        ? identity
        : retry({
            delay: (_, retryCount) =>
              backoffSignal(this.backoffConfig, retryCount),
            count: this.backoffConfig.maxCount,
          }),
      tap({
        error: () => {
          this.setConnectionState("error");
        },
      })
    );
  }

  getConnectionStateObservable() {
    return this.connectionState$.asObservable();
  }

  getErrorObservable() {
    return this.error$.asObservable();
  }

  send(message: Nostr.ToRelayMessage.Any) {
    if (this.connectionState === "terminated") {
      return;
    }

    const type = message[0];
    if (type === "REQ") {
      const subId = message[1];
      this.reqs.set(subId, message);
    }
    if (type === "CLOSE") {
      const subId = message[1];
      this.reqs.delete(subId);
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else if (type === "EVENT") {
      if (this.socket?.readyState === WebSocket.CONNECTING) {
        // Enqueue
        this.queuedEvents.push(message);
      } else {
        // Create a temporary socket to send message.
        const socket = new WebSocket(this.url);
        socket.addEventListener("open", () => {
          socket.send(JSON.stringify(message));
        });

        // Close the temporary socket after receiveing OK or timed out.
        socket.addEventListener("message", ({ data }) => {
          try {
            const response: Nostr.ToClientMessage.Any = JSON.parse(data);
            if (response[0] === "OK") {
              socket.close();
            }
            this.message$.next({ from: this.url, message: response });
          } catch (err) {
            this.message$.error(err);
          }
        });
        setTimeout(() => {
          if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
          ) {
            socket.close();
          }
        }, 10 * 1000);
      }
    } else {
      // Currently rx-nostr only sends REQ, CLOSE, and EVENT,
      // so this branch is for REQ or CLOSE when connection is down.
      // Nothing needs to be done here,
      // as the REQ will be reconstituted based on the `reqs`
      // when the connection is established again.
    }
  }

  dispose() {
    this.setConnectionState("terminated");

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      this.socket?.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
    }
    this.socket = null;

    this.message$.complete();
    this.message$.unsubscribe();
    this.connectionState$.complete();
    this.connectionState$.unsubscribe();
    this.error$.complete();
    this.error$.unsubscribe();
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

export type BackoffConfig =
  | {
      strategy: "exponential";
      maxCount: number;
      initialDelay: number;
    }
  | {
      strategy: "linear";
      maxCount: number;
      interval: number;
    }
  | {
      strategy: "immediately";
      maxCount: number;
    }
  | {
      strategy: "off";
    };

function backoffSignal(
  config: BackoffConfig,
  count: number
): ObservableInput<unknown> {
  if (config.strategy === "exponential") {
    const time = Math.max(
      config.initialDelay * 2 ** (count - 1) + (Math.random() - 1) * 1000,
      1000
    );
    return timer(time);
  } else if (config.strategy === "linear") {
    return timer(config.interval);
  } else if (config.strategy === "immediately") {
    return of(0);
  } else {
    return EMPTY;
  }
}

class WebSocketError extends Error {
  constructor(public code?: number) {
    super(`WebSocket Error: Socket was closed with code ${code}`);
  }
}
