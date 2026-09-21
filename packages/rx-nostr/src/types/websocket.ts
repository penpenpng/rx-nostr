export interface WebSocketBlob {
  readonly size: number;
  readonly type?: string;
}

export type WebSocketData =
  | string
  | ArrayBufferLike
  | WebSocketBlob
  | ArrayBufferView;

export interface WebSocketOpenEvent {
  readonly type?: string;
}

export interface WebSocketMessageEvent {
  readonly data: WebSocketData;
}

export interface WebSocketErrorEvent {
  readonly type?: string;
  readonly cause?: unknown;
}

export interface WebSocketCloseEvent {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
}

export type WebSocketEventListener<TEvent> = {
  bivarianceHack(event: TEvent): unknown;
}["bivarianceHack"];

/**
 * The structural WebSocket surface accepted by rx-nostr.
 *
 * This is owned by rx-nostr so its public API does not depend on transport
 * implementation types.
 */
export interface WebSocketLike {
  readonly readyState: number;
  onopen: WebSocketEventListener<WebSocketOpenEvent> | null;
  onmessage: WebSocketEventListener<WebSocketMessageEvent> | null;
  onerror: WebSocketEventListener<WebSocketErrorEvent> | null;
  onclose: WebSocketEventListener<WebSocketCloseEvent> | null;
  send(data: WebSocketData): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;
