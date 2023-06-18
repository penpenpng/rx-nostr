import { CloseOptions } from "mock-socket";
import { WS } from "vitest-websocket-mock";

import { Nostr } from "../nostr/primitive.js";
import { fakeEventMessage } from "./stub.js";

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
  emit(): Nostr.IncomingMessage.Sub[];
  allowEvent(): void;
  denyEvent(): void;
}

interface MockRelayBehavior extends MockServerBehavior, MockRelayController {}

function relayBehavior(): MockRelayBehavior {
  const generators: Map<
    MockServerSocket /* socket */,
    Map<string /* subId */, MockRelayResponseGenerator>
  > = new Map();
  let allowEvent = true;

  return {
    onMessage(socket, rawMessage) {
      if (typeof rawMessage !== "string") {
        throw new Error("Unexpected type message");
      }

      const message: Nostr.OutgoingMessage.Any = JSON.parse(rawMessage);
      switch (message[0]) {
        case "REQ": {
          if (!generators.has(socket)) {
            generators.set(socket, new Map());
          }
          const req = message;
          const subId = req[1];
          generators.get(socket)?.set(subId, events(req));
          break;
        }
        case "CLOSE": {
          const subId = message[1];
          generators.get(socket)?.delete(subId);
          break;
        }
        case "EVENT": {
          const event = message[1];
          if (allowEvent) {
            const ok: Nostr.IncomingMessage.OK = ["OK", event.id, false];
            socket.send(ok);
          } else {
            const notice: Nostr.IncomingMessage.NOTICE = ["NOTICE", "Rejected"];
            socket.send(notice);
          }
          break;
        }
      }
    },
    onClose(socket) {
      socket.close();
    },
    onError(socket) {
      socket.close();
    },
    emit() {
      const finished: [MockServerSocket, string][] = [];
      const emitted: Nostr.IncomingMessage.Sub[] = [];

      for (const [socket, x] of generators.entries()) {
        for (const [subId, generator] of x.entries()) {
          const { value, done } = generator.next();
          if (done) {
            finished.push([socket, subId]);
          } else {
            socket.send(value);
            emitted.push(value);
          }
        }
      }
      for (const [socket, subId] of finished) {
        generators.get(socket)?.delete(subId);
      }

      return emitted;
    },
    allowEvent() {
      allowEvent = true;
    },
    denyEvent() {
      allowEvent = false;
    },
  };
}

export interface MockRelay extends WS, MockRelayController {}

export function setupMockRelay(url: string): MockRelay {
  const behavior = relayBehavior();
  const server = createMockServer(url, behavior);

  return Object.assign(server, {
    emit: () => behavior.emit(),
    allowEvent: () => behavior.allowEvent(),
    denyEvent: () => behavior.denyEvent(),
  });
}

export type MockRelayResponseGenerator = Generator<
  Nostr.IncomingMessage.Sub,
  void,
  unknown
>;

function* events(req: Nostr.OutgoingMessage.REQ) {
  const [, subId, ...filters] = req;

  // Use only the first filter.
  const filter = filters[0];

  const eose: Nostr.IncomingMessage.EOSE = ["EOSE", subId];

  for (let i = 0; i < (filter.limit ?? 0); i++) {
    yield fakeEventMessage({ subId });
  }
  yield eose;
  while (true) {
    yield fakeEventMessage({ subId });
  }
}
