import * as Nostr from "nostr-typedef";
import { expect, vi } from "vitest";
import type { RelayUrl } from "../../libs";
import type { EventPacket } from "../../packets";
import type {
  ControlledWebSocket,
  ControlledWebSocketServer,
} from "../support/controlled-websocket.ts";

interface MockCallback {
  readonly mock: { readonly calls: readonly unknown[][] };
}

export async function expectSent<T extends Nostr.ToRelayMessage.Type>(
  socket: ControlledWebSocket,
  type: T,
  count = 1,
): Promise<Nostr.ToRelayMessage.Message<T>> {
  await vi.waitFor(() => expect(socket.sentOfType(type)).toHaveLength(count));
  return socket.latestSent(type);
}

export async function expectConnectionCount(
  server: ControlledWebSocketServer,
  count: number,
): Promise<void> {
  await vi.waitFor(() => expect(server.connections).toHaveLength(count));
}

export async function expectSocketCloseRequested(
  socket: ControlledWebSocket,
  count = 1,
): Promise<void> {
  await vi.waitFor(() => expect(socket.closeRequests).toHaveLength(count));
}

export async function expectAllSocketsCloseRequested(
  server: ControlledWebSocketServer,
): Promise<void> {
  await vi.waitFor(() =>
    expect(server.connections.every((socket) => socket.closeRequests.length === 1)).toBe(true),
  );
}

export async function expectObservableCompleted(
  complete: MockCallback,
  error?: MockCallback,
): Promise<void> {
  await expectCallbackCalled(complete);
  if (error) expect(error.mock.calls).toHaveLength(0);
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
