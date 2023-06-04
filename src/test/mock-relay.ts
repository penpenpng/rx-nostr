import { WS } from "jest-websocket-mock";

import { Nostr } from "../nostr/primitive.js";
import { fakeEventMessage } from "./stub.js";

export function createMockRelay(url: string, interval = 10) {
  const server = new WS(url);
  const provider = new FakeEventProvider(interval);

  server.on("connection", (ws) => {
    ws.on("message", function incoming(rawMessage) {
      if (typeof rawMessage !== "string") {
        throw new Error("Unexpected type message");
      }

      const message: Nostr.OutgoingMessage.Any = JSON.parse(rawMessage);
      const type = message[0];

      if (type === "REQ") {
        const [, subId, ...filters] = message;
        provider.start(ws.url, subId, filters, (event) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(event));
          }
        });
      }
      if (type === "CLOSE") {
        const subId = message[1];
        provider.stop(ws.url, subId);
      }
    });

    ws.on("close", () => {
      provider.stop(ws.url);
    });

    ws.on("error", () => {
      provider.stop(ws.url);
    });
  });

  return server;
}

class FakeEventProvider {
  private subs: Record<string, Record<string, NodeJS.Timeout>> = {};

  constructor(private interval: number) {}

  start(
    url: string,
    subId: string,
    filters: Nostr.Filter[],
    callback: (
      event: Nostr.IncomingMessage.EVENT | Nostr.IncomingMessage.EOSE
    ) => void
  ): void {
    this.subs[url] ??= {};

    const timeout = this.subs[url][subId];
    if (timeout) {
      clearInterval(timeout);
    }

    const storedEvents = generateFakeStoredEvents(subId, filters);
    let idx = 0;

    const sendingStoredEvents = setInterval(() => {
      if (idx < storedEvents.length) {
        callback(storedEvents[idx++]);
      } else {
        clearInterval(sendingStoredEvents);
        callback(["EOSE", subId]);
        this.subs[url][subId] = setTimeout(() => {
          callback(fakeEventMessage({ subId }));
        }, this.interval);
      }
    }, 10);
  }

  stop(url: string, subId?: string): void {
    const subs = this.subs[url] ?? {};
    if (subId) {
      const timeout = subs[subId];
      if (timeout) {
        clearInterval(timeout);
      }
      delete subs[subId];
    } else {
      for (const subId of Object.keys(subs)) {
        this.stop(url, subId);
      }
    }
  }
}

function generateFakeStoredEvents(
  subId: string,
  filters: Nostr.Filter[]
): Nostr.IncomingMessage.EVENT[] {
  return filters.flatMap((filter) => {
    const limit = filter.limit;
    if (limit) {
      return Array.from({ length: limit }).map(() =>
        fakeEventMessage({ subId })
      );
    } else {
      return [];
    }
  });
}

export async function expectReceiveMessage(
  relay: WS,
  message: Nostr.OutgoingMessage.Any
) {
  await expect(relay).toReceiveMessage(JSON.stringify(message));
}
