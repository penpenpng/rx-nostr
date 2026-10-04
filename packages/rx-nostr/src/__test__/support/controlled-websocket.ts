import type * as Nostr from "nostr-typedef";
import type { WebSocketConstructor, WebSocketData, WebSocketLike } from "rx-nostr";

import { QueueInspector } from "../helper/queue-inspector.ts";

class MessageInspector extends QueueInspector<Nostr.ToRelayMessage.Any> {
  override waitNext(): Promise<Nostr.ToRelayMessage.Any>;
  override waitNext<T extends Nostr.ToRelayMessage.Type>(
    type: T,
  ): Promise<Nostr.ToRelayMessage.Message<T>>;
  override async waitNext(type?: Nostr.ToRelayMessage.Type): Promise<Nostr.ToRelayMessage.Any> {
    const message = await super.waitNext();
    if (type !== undefined && message[0] !== type) {
      throw new Error(
        `${this.name}: expected ${type} as the next message, received ${JSON.stringify(message)}`,
      );
    }
    return message;
  }
}

type Handler<T> = ((event: T) => unknown) | null;

export class ControlledWebSocket implements WebSocketLike {
  readonly inbox: MessageInspector;
  #closeRequested = Promise.withResolvers<Readonly<{ code?: number; reason?: string }>>();
  readonly closeRequested = this.#closeRequested.promise;
  #isCloseRequested = false;

  get isCloseRequested() {
    return this.#isCloseRequested;
  }
  readyState = 0;
  onopen: Handler<{ type: string }> = null;
  onmessage: Handler<{ data: WebSocketData }> = null;
  onerror: Handler<{ type: string; cause?: unknown }> = null;
  onclose: Handler<{
    code: number;
    reason: string;
    wasClean: boolean;
  }> = null;

  constructor(readonly url: string) {
    this.inbox = new MessageInspector(`WebSocket inbox (${url})`);
  }

  send(data: WebSocketData): void {
    if (this.readyState !== 1) throw new Error("The controlled socket is not open.");
    if (typeof data !== "string") {
      throw new TypeError("Expected a Nostr JSON text message from the client.");
    }
    const message: unknown = JSON.parse(data);
    if (!Array.isArray(message)) {
      throw new TypeError("Expected a Nostr message tuple from the client.");
    }
    this.inbox.push(message as Nostr.ToRelayMessage.Any);
  }

  close(code?: number, reason?: string): void {
    if (!this.#isCloseRequested) {
      this.#isCloseRequested = true;
      this.#closeRequested.resolve(Object.freeze({ code, reason }));
    }
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({ type: "open" });
  }

  message(data: Nostr.ToClientMessage.Any): void {
    this.rawMessage(JSON.stringify(data));
  }

  /** Deliver malformed or non-text data in transport/codec failure tests. */
  rawMessage(data: WebSocketData): void {
    this.onmessage?.({ data });
  }

  error(cause?: unknown): void {
    this.onerror?.({ type: "error", cause });
  }

  peerClose(code = 1006, reason = "peer closed", wasClean = false): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean });
  }

  acknowledgeClose(code = 1000, reason = ""): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: true });
  }
}

export class ControlledWebSocketServer {
  readonly connections = new QueueInspector<ControlledWebSocket>("WebSocket connections");
  readonly sockets: Readonly<{
    readonly latest: ControlledWebSocket;
    latestFor(url: string): ControlledWebSocket;
  }>;
  readonly WebSocket: WebSocketConstructor;

  constructor() {
    const connections = this.connections;
    this.sockets = Object.freeze({
      get latest(): ControlledWebSocket {
        const socket = [...connections].at(-1);
        if (!socket) throw new Error("No controlled connection has been created.");
        return socket;
      },
      latestFor(url: string): ControlledWebSocket {
        const socket = [...connections].findLast((connection) => connection.url === url);
        if (!socket) throw new Error(`No controlled connection has been created for ${url}.`);
        return socket;
      },
    });
    this.WebSocket = class {
      constructor(url: string) {
        const socket = new ControlledWebSocket(url);
        connections.push(socket);
        return socket;
      }
    } as unknown as WebSocketConstructor;
  }
}
