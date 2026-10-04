import * as Nostr from "nostr-typedef";
import { expect, vi } from "vitest";

import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";

interface MockCallback {
  readonly mock: { readonly calls: readonly unknown[][] };
}

export async function expectCallbackCalled(callback: MockCallback, count = 1): Promise<void> {
  await vi.waitFor(() => expect(callback.mock.calls).toHaveLength(count));
}

export class Expect {
  static eventPacket({
    from,
    traceTag,
    ...event
  }: Partial<Nostr.Event> & {
    from?: RelayUrl;
    traceTag?: string | number;
  }): EventPacket {
    return expect.objectContaining({
      from: from ? from : expect.anything(),
      ...(traceTag === undefined ? {} : { traceTag }),
      event: expect.objectContaining(event),
    });
  }
}
