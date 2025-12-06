import * as Nostr from "nostr-typedef";
import { Subject, type Observable } from "rxjs";
import { once, RxDisposableStack } from "../libs/index.ts";
import type { RelayUrl } from "../libs/relay-urls.ts";
import type { MessagePacket } from "../packets/packets.interface.ts";

class NostrWebsocket {
  private stack = new RxDisposableStack();
  private stream: Subject<MessagePacket> = this.stack.add(new Subject());
  private errors: Subject<unknown> = this.stack.add(new Subject());
  private socket: WebSocket | null = null;

  constructor(public url: RelayUrl) {}

  private onopen = () => {
    // バッファをフラッシュする
  };
  private onmessage = ({ data }: IMessageEvent) => {
    if (this.state === "terminated") {
      return;
    }

    try {
      this.stream.next(pack(this.url, JSON.parse(data)));
    } catch (err) {
      this.errors.next(err);
    }
  };
  private onclose = ({ code, target }: ICloseEvent) => {
    if (target instanceof WebSocket) {
      target.removeEventListener("open", this.onopen);
      target.removeEventListener("message", this.onmessage);
      target.removeEventListener("close", this.onclose);
    }
    if (this.socket === target) {
      this.socket = null;
    }

    // リトライロジック
  };

  connect() {
    try {
      // TODO: options.websocketCtor
      const socket = new WebSocket(this.url);

      socket.addEventListener("open", this.onopen);
      socket.addEventListener("message", this.onmessage);
      socket.addEventListener("close", this.onclose);

      this.socket = socket;
    } catch (err: unknown) {
      this.onclose({
        type: "close",
        code: 0,
        reason: `${err}`,
        target: null,
      });
    }
  }

  disconnect(code: WebSocketCloseCode) {
    if (this.socket?.readyState === ReadyState.OPEN) {
      this.socket.close(code);
    }
  }

  send(message: () => string) {}

  asObservable(): Observable<MessagePacket> {
    return this.stream.asObservable();
  }

  setState(state: string) {}

  [Symbol.dispose] = once(() => {
    this.stack.dispose();
  });
  dispose = this[Symbol.dispose];
}

function pack(from: RelayUrl, raw: Nostr.ToClientMessage.Any): MessagePacket {
  const type = raw[0];

  switch (type) {
    case "EVENT":
      return {
        from,
        type,
        raw,
        subId: raw[1],
        event: raw[2],
      };
    case "EOSE":
      return {
        from,
        type,
        raw,
        subId: raw[1],
      };
    case "OK":
      return {
        from,
        type,
        raw,
        eventId: raw[1],
        ok: raw[2],
        notice: raw[3],
        noticeType: noticeType(raw[3]),
      };
    case "CLOSED":
      return {
        from,
        type,
        raw,
        subId: raw[1],
        notice: raw[2],
        noticeType: noticeType(raw[3]),
      };
    case "NOTICE":
      return {
        from,
        type,
        raw,
        notice: raw[1],
      };
    case "AUTH":
      return {
        from,
        type,
        raw,
        challenge: raw[1],
      };
    case "COUNT":
      return {
        from,
        type,
        raw,
        subId: raw[1],
        count: raw[2],
      };
    default:
      return {
        from,
        type: "unknown",
        raw,
      };
  }
}

export interface IWebSocketConstructor {
  new (url: string): IWebSocket;
}

export interface IWebSocket {
  readyState: number;

  addEventListener(
    method: "message",
    callback: (event: IMessageEvent) => void,
  ): void;
  addEventListener(
    method: "close",
    callback: (event: ICloseEvent) => void,
  ): void;
  addEventListener(method: "open", callback: () => void): void;
  removeEventListener(
    method: "message",
    callback: (event: IMessageEvent) => void,
  ): void;
  removeEventListener(
    method: "close",
    callback: (event: ICloseEvent) => void,
  ): void;
  removeEventListener(method: "open", callback: () => void): void;

  send(data: string): void;
  close(code?: number): void;
}

export interface ICloseEvent {
  type: string;
  code: number;
  reason: string;
  target: EventTarget | null;
}

export interface IMessageEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export const ReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

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
