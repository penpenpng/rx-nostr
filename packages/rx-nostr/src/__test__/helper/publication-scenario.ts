import type * as Nostr from "nostr-typedef";
import { NoopSigner, type RxNostrConfig } from "rx-nostr";
import type {
  ControlledWebSocket,
  ControlledWebSocketServer,
} from "../support/controlled-websocket.ts";
import { expectSent } from "./expect.ts";
import { Faker } from "./faker.ts";
import { createRxNostrScenario } from "./rx-nostr-scenario.ts";

export const publicationRelay1 = "wss://relay1.example.com";
export const publicationRelay2 = "wss://relay2.example.com";

export function publicationEvent(overrides: Partial<Nostr.Event> = {}): Nostr.Event {
  return Faker.event({
    id: "event",
    pubkey: "pubkey",
    created_at: 1,
    kind: 1,
    tags: [["t", "before"]],
    content: "before",
    sig: "signature",
    ...overrides,
  });
}

export function publicationSocket(
  server: ControlledWebSocketServer,
  url: string,
): ControlledWebSocket {
  return server.sockets.latestFor(url);
}

export async function expectPublicationSent(connection: ControlledWebSocket): Promise<void> {
  await expectSent(connection, "EVENT");
}

export function createPublicationScenario(overrides: Partial<RxNostrConfig> = {}) {
  return createRxNostrScenario({
    signer: new NoopSigner(),
    defaultOptions: { publish: { linger: 0, timeout: 1_000 } },
    ...overrides,
  });
}
