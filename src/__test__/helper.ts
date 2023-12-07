import Nostr from "nostr-typedef";
import {
  first,
  firstValueFrom,
  type MonoTypeOperatorFunction,
  tap,
  timeout,
} from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { expect } from "vitest";
import { createClientSpy, faker as _faker, type MockRelay } from "vitest-nostr";

import { WebSocketCloseCode } from "../connection/relay.js";
import { ConnectionState, EventPacket, MessagePacket } from "../packet.js";
import { RxNostr } from "../rx-nostr/index.js";

export function testScheduler() {
  return new TestScheduler((a, b) => expect(a).toEqual(b));
}

export const faker = {
  ..._faker,
  eventPacket(
    packetOrEvent?: Partial<
      EventPacket["event"] &
        Omit<EventPacket, "event"> & {
          event?: Partial<EventPacket["event"]>;
        }
    >
  ): EventPacket {
    const message: Nostr.ToClientMessage.EVENT = [
      "EVENT",
      packetOrEvent?.subId ?? "*",
      faker.event(packetOrEvent?.event ?? packetOrEvent),
    ];

    return {
      from: packetOrEvent?.from ?? "*",
      subId: packetOrEvent?.subId ?? "*",
      event: faker.event(packetOrEvent?.event ?? packetOrEvent),
      message,
      type: "EVENT",
    };
  },
  messagePacket(message: Nostr.ToClientMessage.Any): MessagePacket {
    const from = "*";
    const type = message[0];

    switch (type) {
      case "EVENT":
        return {
          from,
          type,
          message,
          subId: message[1],
          event: message[2],
        };
      case "EOSE":
        return {
          from,
          type,
          message,
          subId: message[1],
        };
      case "OK":
        return {
          from,
          type,
          message,
          eventId: message[1],
          id: message[1],
          ok: message[2],
          notice: message[3],
        };
      case "CLOSED":
        return {
          from,
          type,
          message,
          subId: message[1],
          notice: message[2],
        };
      case "NOTICE":
        return {
          from,
          type,
          message,
          notice: message[1],
        };
      case "AUTH":
        return {
          from,
          type,
          message,
          challengeMessage: message[1],
        };
      case "COUNT":
        return {
          from,
          type,
          message,
          subId: message[1],
          count: message[2],
        };
    }
  },
};

export function spySubscription(): {
  completed: () => boolean;
  error: () => boolean;
  count: () => number;
  subscribed: () => boolean;
  unsubscribed: () => boolean;
  tap: <T>() => MonoTypeOperatorFunction<T>;
} {
  let completed = false;
  let error = false;
  let count = 0;
  let subscribed = false;
  let unsubscribed = false;

  return {
    completed: () => completed,
    error: () => error,
    count: () => count,
    subscribed: () => subscribed,
    unsubscribed: () => unsubscribed,
    tap: () =>
      tap({
        complete: () => void (completed = true),
        error: () => void (error = true),
        next: () => void count++,
        subscribe: () => void (subscribed = true),
        unsubscribe: () => void (unsubscribed = true),
      }),
  };
}

export function spyMessage(): {
  tap: () => MonoTypeOperatorFunction<MessagePacket>;
} {
  let tapNext: (message: Nostr.ToClientMessage.Any) => void;
  const spy = createClientSpy((listener) => {
    tapNext = listener;
  });

  return {
    tap: () =>
      tap((packet) => {
        tapNext(packet.message);
      }),
    ...spy,
  };
}

export function spyEvent(): {
  tap: () => MonoTypeOperatorFunction<EventPacket>;
} {
  let tapNext: (message: Nostr.ToClientMessage.Any) => void;
  const spy = createClientSpy((listener) => {
    tapNext = listener;
  });

  return {
    tap: () =>
      tap((packet) => {
        tapNext(["EVENT", packet.subId, packet.event]);
      }),
    ...spy,
  };
}

export async function closeSocket(relay: MockRelay, code: number, index = 0) {
  const socket = await relay.getSocket(index);
  socket.close({
    code: code,
    reason: "For test",
    wasClean: true,
  });
}

export function disposeMockRelay(relay: MockRelay) {
  relay.close({
    code: WebSocketCloseCode.RX_NOSTR_DISPOSED,
    reason: "Clean up on afterEach()",
    wasClean: true,
  });
}

export async function stateWillBe(
  rxNostr: RxNostr,
  url: string,
  state: ConnectionState
): Promise<boolean> {
  if (rxNostr.getRelayState(url) === state) {
    return true;
  }

  const state$ = rxNostr.createConnectionStateObservable().pipe(
    first((packet) => packet.from === url && packet.state === state),
    timeout(100)
  );

  try {
    await firstValueFrom(state$);
    return true;
  } catch (err) {
    return false;
  }
}
