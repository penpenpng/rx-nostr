import type { WebSocketConstructor, WebSocketData, WebSocketLike } from "../../types/index.ts";

type Handler<T> = ((event: T) => unknown) | null;

export class ControlledWebSocket implements WebSocketLike {
  readonly sent: WebSocketData[] = [];
  readonly closeRequests: Readonly<{ code?: number; reason?: string }>[] = [];
  readyState = 0;
  onopen: Handler<{ type: string }> = null;
  onmessage: Handler<{ data: WebSocketData }> = null;
  onerror: Handler<{ type: string; cause?: unknown }> = null;
  onclose: Handler<{
    code: number;
    reason: string;
    wasClean: boolean;
  }> = null;

  constructor(readonly url: string) {}

  send(data: WebSocketData): void {
    if (this.readyState !== 1) throw new Error("The controlled socket is not open.");
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeRequests.push(Object.freeze({ code, reason }));
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({ type: "open" });
  }

  message(data: WebSocketData): void {
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
  readonly connections: ControlledWebSocket[] = [];
  readonly WebSocket: WebSocketConstructor;

  constructor() {
    const connections = this.connections;
    this.WebSocket = class {
      constructor(url: string) {
        const socket = new ControlledWebSocket(url);
        connections.push(socket);
        return socket;
      }
    } as unknown as WebSocketConstructor;
  }

  get current(): ControlledWebSocket {
    const socket = this.connections.at(-1);
    if (!socket) throw new Error("No controlled connection has been created.");
    return socket;
  }
}
