// the minimum WebSocket interface definition for rx-nostr to work

export interface IWebSocketConstructor {
  new (url: string): IWebSocket;
}

export interface IWebSocket {
  readyState: number;

  addEventListener(
    method: "message",
    callback: (event: IMessageEvent) => void
  ): void;
  addEventListener(
    method: "close",
    callback: (event: ICloseEvent) => void
  ): void;
  addEventListener(method: "open", callback: () => void): void;
  removeEventListener(
    method: "message",
    callback: (event: IMessageEvent) => void
  ): void;
  removeEventListener(
    method: "close",
    callback: (event: ICloseEvent) => void
  ): void;
  removeEventListener(method: "open", callback: () => void): void;

  send(data: string): void;
  close(code?: number): void;
}

export interface ICloseEvent {
  type: string;
  code: number;
  reason: string;
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
