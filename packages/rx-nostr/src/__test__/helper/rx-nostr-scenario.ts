import { NoopReconnector, NoopVerifier, RxNostr, type RxNostrConfig } from "rx-nostr";
import { ControlledWebSocketServer } from "../support/controlled-websocket.ts";

export interface RxNostrScenario {
  readonly server: ControlledWebSocketServer;
  readonly rxNostr: RxNostr;
}

export function createRxNostrScenario(
  overrides: Partial<RxNostrConfig> = {},
  server = new ControlledWebSocketServer(),
): RxNostrScenario {
  const rxNostr = new RxNostr({
    verifier: new NoopVerifier(),
    reconnector: new NoopReconnector(),
    defaultOptions: { req: { linger: 0, timeout: 1_000 } },
    skipFetchNip11: true,
    WebSocket: server.WebSocket,
    ...overrides,
  });
  return { server, rxNostr };
}
