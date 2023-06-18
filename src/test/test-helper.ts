import { TestScheduler } from "rxjs/testing";
import { expect } from "vitest";

import { Nostr } from "../nostr/primitive";

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

export function testScheduler() {
  return new TestScheduler((a, b) => expect(a).toEqual(b));
}

export function isEvent(message: Nostr.IncomingMessage.Sub): boolean {
  return message[0] === "EVENT";
}

export function isEose(message: Nostr.IncomingMessage.Sub): boolean {
  return message[0] === "EOSE";
}

export function countEose(messages: Nostr.IncomingMessage.Sub[]): number {
  return messages.filter(isEose).length;
}
