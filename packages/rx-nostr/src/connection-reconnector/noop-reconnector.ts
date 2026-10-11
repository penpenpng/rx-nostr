import type { ConnectionReconnector } from "./connection-reconnector.interface.ts";

export class NoopReconnector implements ConnectionReconnector {
  reconnect() {
    return { action: "exhaust" } as const;
  }
}
