import { CloseOptions } from "mock-socket";
import { MonoTypeOperatorFunction, tap } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { expect } from "vitest";
import { WS } from "vitest-websocket-mock";

import { Nostr } from "../nostr/primitive";
import { EventPacket } from "../packet";

export function testScheduler() {
  return new TestScheduler((a, b) => expect(a).toEqual(b));
}

export interface MockServerSocket {
  id: number;
  send(message: unknown): void;
  close(options?: CloseOptions): void;
}

export interface MockServerBehavior {
  onMessage?(socket: MockServerSocket, message: string): void;
  onClose?(socket: MockServerSocket): void;
  onError?(socket: MockServerSocket, error: Error): void;
}

export function createMockServer(
  url: string,
  behavior: MockServerBehavior
): WS {
  const server = new WS(url, { jsonProtocol: true });
  let nextId = 1;

  server.on("connection", (_socket) => {
    const socket: MockServerSocket = {
      id: nextId++,
      send(message) {
        if (_socket.readyState !== WebSocket.OPEN) {
          return;
        }

        _socket.send(
          typeof message === "string" ? message : `${JSON.stringify(message)}`
        );
      },
      close(options) {
        _socket.close(options);
      },
    };

    _socket.on("message", (message) => {
      if (typeof message !== "string") {
        throw new Error("Unexpected type message");
      }
      behavior.onMessage?.(socket, message);
    });

    _socket.on("close", () => {
      behavior.onClose?.(socket);
    });

    _socket.on("error", (error) => {
      behavior.onError?.(socket, error);
    });
  });

  return server;
}

export interface MockRelayController {
  emitEvent(subId: string): void;
  emitEose(subId: string): void;
  allowEvent(): void;
  denyEvent(): void;
}

interface MockRelayBehavior extends MockServerBehavior, MockRelayController {}

function relayBehavior(): MockRelayBehavior {
  const subs: Map<MockServerSocket, Set<string /* subId */>> = new Map();
  let allowEvent = true;

  return {
    onMessage(socket, rawMessage) {
      if (typeof rawMessage !== "string") {
        throw new Error("Unexpected type message");
      }

      const message: Nostr.OutgoingMessage.Any = JSON.parse(rawMessage);
      switch (message[0]) {
        case "REQ": {
          if (!subs.has(socket)) {
            subs.set(socket, new Set());
          }
          const subId = message[1];
          subs.get(socket)?.add(subId);
          break;
        }
        case "CLOSE": {
          const subId = message[1];
          subs.get(socket)?.delete(subId);
          break;
        }
        case "EVENT": {
          const event = message[1];
          if (allowEvent) {
            const ok: Nostr.IncomingMessage.OK = ["OK", event.id, true];
            socket.send(ok);
          } else {
            const ok: Nostr.IncomingMessage.OK = ["OK", event.id, false];
            socket.send(ok);
            const notice: Nostr.IncomingMessage.NOTICE = ["NOTICE", "Rejected"];
            socket.send(notice);
          }
          break;
        }
      }
    },
    onClose(socket) {
      subs.delete(socket);
      socket.close();
    },
    onError(socket) {
      subs.delete(socket);
      socket.close();
    },
    emitEvent(subId) {
      for (const [socket, activeSubIds] of subs.entries()) {
        if (activeSubIds.has(subId)) {
          const event: Nostr.IncomingMessage.EVENT = [
            "EVENT",
            subId,
            faker.event(),
          ];
          socket.send(event);
        }
      }
    },
    emitEose(subId) {
      for (const [socket, activeSubIds] of subs.entries()) {
        if (activeSubIds.has(subId)) {
          const eose: Nostr.IncomingMessage.EOSE = ["EOSE", subId];
          socket.send(eose);
        }
      }
    },
    allowEvent() {
      allowEvent = true;
    },
    denyEvent() {
      allowEvent = false;
    },
  };
}

export interface MockRelay extends WS, MockRelayController {
  next: () => Promise<Nostr.OutgoingMessage.Any>;
}

export function setupMockRelay(url: string): MockRelay {
  const behavior = relayBehavior();
  const server = createMockServer(url, behavior);

  return Object.assign(server, {
    emitEvent: behavior.emitEvent.bind(behavior),
    emitEose: behavior.emitEose.bind(behavior),
    allowEvent: behavior.allowEvent.bind(behavior),
    denyEvent: behavior.denyEvent.bind(behavior),
    next: () =>
      orTimeout(server.nextMessage as Promise<Nostr.OutgoingMessage.Any>),
  });
}

export const faker = {
  filter(): Nostr.Filter[] {
    return [{ kinds: [0] }];
  },
  event(event?: Partial<Nostr.Event>): Nostr.Event {
    return {
      id: "*",
      content: "*",
      created_at: new Date("2000/1/1").getTime() / 1000,
      kind: 0,
      pubkey: "*",
      sig: "*",
      tags: [],
      ...event,
    };
  },
  eventPacket(
    packetOrEvent?: Partial<
      EventPacket["event"] &
        Omit<EventPacket, "event"> & {
          event?: Partial<EventPacket["event"]>;
        }
    >
  ): EventPacket {
    return {
      from: packetOrEvent?.from ?? "*",
      subId: packetOrEvent?.subId ?? "*",
      event: faker.event(packetOrEvent?.event ?? packetOrEvent),
    };
  },
};

export function isEVENT(
  message: Nostr.IncomingMessage.Any | Nostr.OutgoingMessage.Any
): message is Nostr.IncomingMessage.EVENT | Nostr.OutgoingMessage.EVENT {
  return message[0] === "EVENT";
}
export function isREQ(
  message: Nostr.OutgoingMessage.Any,
  subId?: string
): message is Nostr.OutgoingMessage.REQ {
  return message[0] === "REQ" && (subId === undefined || message[1] === subId);
}
export function isCLOSE(
  message: Nostr.OutgoingMessage.Any,
  subId?: string
): message is Nostr.OutgoingMessage.CLOSE {
  return (
    message[0] === "CLOSE" && (subId === undefined || message[1] === subId)
  );
}

export function subspy(): {
  tap: <T>() => MonoTypeOperatorFunction<T>;
  completed: () => boolean;
  error: () => boolean;
  count: () => number;
  subscribed: () => boolean;
  unsubscribed: () => boolean;
} {
  let completed = false;
  let error = false;
  let count = 0;
  let subscribed = false;
  let unsubscribed = false;

  return {
    tap: () =>
      tap({
        complete: () => void (completed = true),
        error: () => void (error = true),
        next: () => void count++,
        subscribe: () => void (subscribed = true),
        unsubscribe: () => void (unsubscribed = true),
      }),
    completed: () => completed,
    error: () => error,
    count: () => count,
    subscribed: () => subscribed,
    unsubscribed: () => unsubscribed,
  };
}

function orTimeout<T>(promise: Promise<T>, timeout = 1000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(), timeout)),
  ]);
}
