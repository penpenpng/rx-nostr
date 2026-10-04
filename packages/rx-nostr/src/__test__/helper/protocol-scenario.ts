import type { RxNostrConfig } from "rx-nostr";
import { test, vi } from "vitest";

import { createRxNostrScenario, type RxNostrScenario } from "./rx-nostr-scenario.ts";

/** Drain protocol promises without advancing operation deadlines. */
export async function settleProtocol(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

export const scenarioTest = test.extend<{
  createScenario: (config?: Partial<RxNostrConfig>) => RxNostrScenario;
}>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  createScenario: async ({}, use) => {
    vi.useFakeTimers();
    const scenarios: RxNostrScenario[] = [];
    try {
      await use((config) => {
        const scenario = createRxNostrScenario(config);
        scenarios.push(scenario);
        return scenario;
      });
    } finally {
      for (const { rxNostr, server } of scenarios) {
        rxNostr.dispose();
        for (const socket of server.connections) socket.acknowledgeClose();
      }
      await settleProtocol();
      vi.useRealTimers();
    }
  },
});
