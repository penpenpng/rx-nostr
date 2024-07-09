import * as Nostr from "nostr-typedef";
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

import { EventSigner, type EventVerifier } from "../config/index.js";
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
    >,
  ): EventPacket {
    const event = faker.event(packetOrEvent?.event ?? packetOrEvent);

    const message: Nostr.ToClientMessage.EVENT = [
      "EVENT",
      packetOrEvent?.subId ?? "*",
      event,
    ];

    return {
      from: packetOrEvent?.from ?? "*",
      subId: packetOrEvent?.subId ?? "*",
      event,
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
          challenge: message[1],
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
  willComplete: () => Promise<boolean>;
  willError: () => Promise<boolean>;
  willSubscribe: () => Promise<boolean>;
  willUnsubscribe: () => Promise<boolean>;
  getLastValue: () => unknown;
  tap: <T>() => MonoTypeOperatorFunction<T>;
} {
  const timeout = (time: number): Promise<void> =>
    new Promise((_, reject) => {
      setTimeout(reject, time);
    });
  const withTimeout = (promise: Promise<void>) =>
    Promise.race([promise, timeout(50)])
      .then(() => true)
      .catch(() => false);

  let complete: () => void;
  const promiseComplete = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let error: () => void;
  const promiseError = new Promise<void>((resolve) => {
    error = resolve;
  });
  let subscribe: () => void;
  const promiseSubscribe = new Promise<void>((resolve) => {
    subscribe = resolve;
  });
  let unsubscribe: () => void;
  const promiseUnsubscribe = new Promise<void>((resolve) => {
    unsubscribe = resolve;
  });
  let lastValue: unknown;

  return {
    willComplete: () => withTimeout(promiseComplete),
    willError: () => withTimeout(promiseError),
    willSubscribe: () => withTimeout(promiseSubscribe),
    willUnsubscribe: () => withTimeout(promiseUnsubscribe),
    getLastValue: () => lastValue,
    tap: () =>
      tap({
        next: (v) => {
          lastValue = v;
        },
        complete,
        error,
        subscribe,
        unsubscribe,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tapNext(packet.message as any);
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
  state: ConnectionState,
): Promise<boolean> {
  if (rxNostr.getRelayStatus(url)?.connection === state) {
    return true;
  }

  const state$ = rxNostr.createConnectionStateObservable().pipe(
    first((packet) => packet.from === url && packet.state === state),
    timeout(100),
  );

  try {
    await firstValueFrom(state$);
    return true;
  } catch (err) {
    return false;
  }
}

const fakeSig = "__fake_sig__";

export function fakeSigner(idPrefix?: string): EventSigner {
  let count = -1;

  return {
    async signEvent(params) {
      count++;

      return {
        id: `${idPrefix ?? "id"}:${count}`,
        sig: fakeSig,
        kind: params.kind,
        tags: params.tags ?? [],
        pubkey: params.pubkey ?? "*",
        content: params.content,
        created_at: params.created_at ?? 0,
      };
    },
    async getPublicKey() {
      return "*";
    },
  };
}

export function fakeVerifier(): EventVerifier {
  return async (params) => params.sig === fakeSig;
}

export function expectedChallengeEvent(
  id: string,
  relay: string,
  challenge: string,
): Partial<Nostr.Event<Nostr.Kind.ClientAuthentication>> {
  return {
    id,
    kind: 22242,
    tags: [
      ["relay", relay],
      ["challenge", challenge],
    ],
  };
}
