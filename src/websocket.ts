import { Subject } from "rxjs";

import { Nostr } from "./nostr/primitive.js";
import { ConnectionState, MessagePacket } from "./packet.js";

export class WebsocketSubject {
  private socket: WebSocket | null = null;
  private message$ = new Subject<MessagePacket>();
  private connectionState$ = new Subject<ConnectionState>();
  private connectionState: ConnectionState = "not-started";
  private buffer: Nostr.OutgoingMessage.Any[] = [];

  constructor(public url: string) {
    this.connectionState$.next("not-started");
  }

  private setConnectionState(state: ConnectionState) {
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
    } else if (this.connectionState === "error") {
      this.setConnectionState("reconnecting");
    }

    let resolve = () => {
      /* do nothing */
    };
    const resolveOnOpen = new Promise<void>((_resolve) => {
      resolve = _resolve;
    });

    const websocket = new WebSocket(this.url);
    websocket.onopen = () => {
      this.setConnectionState("ongoing");
      resolve();
      for (const msg of this.buffer) {
        this.send(msg);
      }
      this.buffer = [];
    };
    websocket.onerror = () => {
      this.setConnectionState("error");
      this.message$.error(new Error("websocket error"));
      this.socket = null;
    };
    websocket.onmessage = ({ data }) => {
      try {
        this.message$.next({ from: this.url, message: JSON.parse(data) });
      } catch (err) {
        this.message$.error(err);
      }
    };
    websocket.onclose = () => {
      this.socket = null;
    };

    this.socket = websocket;

    return resolveOnOpen;
  }

  stop() {
    this.socket?.close();
  }

  getState() {
    return this.connectionState;
  }

  getMessageObservable() {
    return this.message$.asObservable();
  }

  getConnectionStateObservable() {
    return this.connectionState$.asObservable();
  }

  send(message: Nostr.OutgoingMessage.Any) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else if (this.socket?.readyState === WebSocket.CONNECTING) {
      this.buffer.push(message);
    } else {
      const socket = new WebSocket(this.url);
      socket.onopen = () => {
        socket.send(JSON.stringify(message));
      };
      socket.onmessage = ({ data }) => {
        try {
          const response: Nostr.IncomingMessage.Any = JSON.parse(data);
          if (response[0] === "OK") {
            socket.close();
          }
          this.message$.next({ from: this.url, message: response });
        } catch (err) {
          this.message$.error(err);
        }
      };
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

  dispose() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      this.socket?.close();
    }

    this.message$.complete();
    this.message$.unsubscribe();
    this.setConnectionState("terminated");
    this.connectionState$.complete();
    this.connectionState$.unsubscribe();
  }
}
