import type { ConnectionRetryer } from "./connection-retryer.interface.ts";

export class NoopRetryer implements ConnectionRetryer {
  retry() {
    return { action: "exhaust" } as const;
  }
}
