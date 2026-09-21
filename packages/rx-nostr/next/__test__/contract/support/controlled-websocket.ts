import type {
  WebSocketConstructor,
  WebSocketData,
  WebSocketLike,
} from "rx-nostr";

type Handler<T> = ((event: T) => unknown) | null;

export class ContractWebSocket implements WebSocketLike {
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
    if (this.readyState !== 1) throw new Error("Socket is not open.");
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

  peerClose(code = 1006, reason = "peer closed", wasClean = false): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean });
  }

  acknowledgeClose(): void {
    this.peerClose(1000, "", true);
  }
}

export class ContractWebSocketServer {
  readonly connections: ContractWebSocket[] = [];
  readonly WebSocket: WebSocketConstructor;

  constructor() {
    const connections = this.connections;
    this.WebSocket = class {
      constructor(url: string) {
        const socket = new ContractWebSocket(url);
        connections.push(socket);
        return socket;
      }
    } as unknown as WebSocketConstructor;
  }

  get current(): ContractWebSocket {
    const socket = this.connections.at(-1);
    if (!socket) throw new Error("No connection exists.");
    return socket;
  }
}
