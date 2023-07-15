import Nostr from "nostr-typedef";
import {
  EMPTY,
  filter,
  identity,
  mergeMap,
  MonoTypeOperatorFunction,
  Observable,
  ObservableInput,
  of,
  retry,
  Subject,
  tap,
  timer,
} from "rxjs";

import { evalFilters } from "./helper";
import { isFiltered } from "./nostr/filter";
import { ConnectionState, LazyREQ, MessagePacket } from "./packet";

export class Connection {
  private socket: WebSocket | null = null;
  private message$ = new Subject<MessagePacket | WebSocketError>();
  private error$ = new Subject<unknown>();
  private connectionState$ = new Subject<ConnectionState>();
  private connectionState: ConnectionState = "not-started";
  private queuedEvents: Nostr.ToRelayMessage.EVENT[] = [];
  private reqs: Map<string /* subId */, ActiveReq> = new Map();

  get read() {
    return this.config.read;
  }
  set read(v) {
    this.config.read = v;
  }
  get write() {
    return this.config.write;
  }
  set write(v) {
    this.config.write = v;
  }

  constructor(public url: string, private config: ConnectionConfig) {
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

    if (this.connectionState === "not-started") {
      this.setConnectionState("starting");
    } else {
      this.setConnectionState("reconnecting");
    }

    let completeStartingProcess: () => void;
    const succeededOrFailed = new Promise<void>((_resolve) => {
      completeStartingProcess = _resolve;
    });

    const onopen = () => {
      this.setConnectionState("ongoing");
      completeStartingProcess();
      for (const event of this.queuedEvents) {
        this.sendEVENT(event);
      }
      this.queuedEvents = [];
      for (const req of this.reqs.values()) {
        this.ensureReq(req.original, {
          // force activate because this is a new connection
          overwrite: true,
        });
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
    const onerror = () => {
      completeStartingProcess();
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
      websocket.removeEventListener("error", onerror);
      websocket.removeEventListener("close", onclose);

      if (code === WebSocketCloseCode.DESIRED_BY_RX_NOSTR) {
        this.setConnectionState("not-started");
      } else if (code === WebSocketCloseCode.DONT_RETRY) {
        this.setConnectionState("rejected");
        this.message$.next(new WebSocketError(code));
        completeStartingProcess();
      } else {
        this.message$.next(new WebSocketError(code));
        completeStartingProcess();
      }
    };

    const websocket = new WebSocket(this.url);

    websocket.addEventListener("open", onopen);
    websocket.addEventListener("message", onmessage);
    websocket.addEventListener("error", onerror);
    websocket.addEventListener("close", onclose);

    this.socket = websocket;

    return succeededOrFailed;
  }

  stop() {
    this.finalizeReq();
    this.socket?.close(WebSocketCloseCode.DESIRED_BY_RX_NOSTR);
  }

  getConnectionState() {
    return this.connectionState;
  }

  getMessageObservable(): Observable<MessagePacket> {
    const reqs = this.reqs;

    return this.message$.asObservable().pipe(
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
          this.start();
        },
      }),
      this.config.backoff.strategy === "off"
        ? identity
        : retry({
            delay: (_, retryCount) =>
              backoffSignal(this.config.backoff, retryCount),
            count: this.config.backoff.maxCount,
          }),
      tap({
        error: () => {
          this.setConnectionState("error");
        },
      }),
      rejectFilterUnmatchEvents()
    );

    function rejectFilterUnmatchEvents(): MonoTypeOperatorFunction<MessagePacket> {
      return filter((packet) => {
        const [type, subId, event] = packet.message;

        if (type !== "EVENT") {
          return true;
        }

        const req = reqs.get(subId);
        if (!req) {
          return true;
        }

        const [, , ...filters] = req.actual;

        return isFiltered(event, filters);
      });
    }
  }

  getConnectionStateObservable() {
    return this.connectionState$.asObservable();
  }

  getErrorObservable() {
    return this.error$.asObservable();
  }

  ensureReq(req: LazyREQ, options?: { overwrite?: boolean }) {
    const subId = req[1];

    if (this.connectionState === "terminated") {
      return;
    }
    if (!this.read) {
      // REQ is not allowed.
      return;
    }
    if (this.reqs.has(subId) && !options?.overwrite) {
      // REQ is already ongoing.
      return;
    }

    const message = evalREQ(req);
    this.reqs.set(subId, {
      original: req,
      actual: message,
    });

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  finalizeReq(subId?: string) {
    if (this.connectionState === "terminated") {
      return;
    }

    const subIds = subId === undefined ? Array.from(this.reqs.keys()) : [subId];

    for (const subId of subIds) {
      if (!this.reqs.has(subId)) {
        continue;
      }

      this.reqs.delete(subId);

      const message: Nostr.ToRelayMessage.CLOSE = ["CLOSE", subId];
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(message));
      }
    }
  }

  sendEVENT(message: Nostr.ToRelayMessage.EVENT) {
    if (this.connectionState === "terminated") {
      return;
    }
    if (!this.write) {
      return;
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
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
    }
  }

  dispose() {
    this.finalizeReq();
    this.setConnectionState("terminated");

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      this.socket?.close(WebSocketCloseCode.DISPOSED_BY_RX_NOSTR);
    }
    this.socket = null;

    this.reqs.clear();

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

export interface ConnectionConfig {
  backoff: BackoffConfig;
  read: boolean;
  write: boolean;
}

export type BackoffConfig =
  | {
      // Exponential backoff and jitter strategy
      strategy: "exponential";
      maxCount: number;
      initialDelay: number;
    }
  | {
      // Retry at regular intervals
      strategy: "linear";
      maxCount: number;
      interval: number;
    }
  | {
      // Retry immediately
      strategy: "immediately";
      maxCount: number;
    }
  | {
      // Won't retry
      strategy: "off";
    };

interface ActiveReq {
  original: LazyREQ;
  actual: Nostr.ToRelayMessage.REQ;
}

function backoffSignal(
  config: BackoffConfig,
  count: number
): ObservableInput<unknown> {
  if (config.strategy === "exponential") {
    const time = Math.max(
      config.initialDelay * 2 ** (count - 1) + (Math.random() - 0.5) * 1000,
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

function evalREQ([type, subId, ...filters]: LazyREQ): Nostr.ToRelayMessage.REQ {
  return [type, subId, ...evalFilters(filters)];
}

class WebSocketError extends Error {
  constructor(public code?: number) {
    super(`WebSocket Error: Socket was closed with code ${code}`);
  }
}
