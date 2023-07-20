import Nostr from "nostr-typedef";
import { type MonoTypeOperatorFunction, tap } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { expect } from "vitest";
import { createClientSpy, faker as _faker } from "vitest-nostr";

import { EventPacket, MessagePacket } from "../packet.js";

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
    return {
      from: packetOrEvent?.from ?? "*",
      subId: packetOrEvent?.subId ?? "*",
      event: faker.event(packetOrEvent?.event ?? packetOrEvent),
    };
  },
  messagePacket(message: Nostr.ToClientMessage.Any): MessagePacket {
    return {
      from: "*",
      message,
    };
  },
};

export function spySub(): {
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
