import { describe, expect, test, vi } from "vitest";
import { normalizeRelayUrl } from "../libs/index.ts";
import { RelayDirectory } from "../relay-directory/index.ts";
import { RelayDirectoryBridge } from "./relay-directory-bridge.ts";

describe("RelayDirectoryBridge", () => {
  test("bridges capacity, connection lifecycle, and reconnect health", () => {
    let now = 1;
    const url = normalizeRelayUrl("wss://relay.example.com")!;
    const directory = new RelayDirectory({ clock: () => now });
    const onMaxSubscriptions = vi.fn();
    const bridge = new RelayDirectoryBridge(url, directory, onMaxSubscriptions, vi.fn());

    expect(onMaxSubscriptions).not.toHaveBeenCalled();
    directory.setNip11(url, { limitation: { max_subscriptions: 2 } });
    expect(onMaxSubscriptions).toHaveBeenLastCalledWith(2);

    const connectionClosed = bridge.transportHooks.onConnectionOpened!();
    expect(directory.get(url)).toMatchObject({
      lastConnectedAt: 1,
      liveConnections: 1,
    });

    now = 2;
    bridge.transportHooks.onConnectionFailed!();
    expect(bridge.transportHooks.getConnectionHealth!()).toEqual({
      consecutiveFailures: 1,
      lastConnectedAt: 1,
      lastFailureAt: 2,
    });

    connectionClosed();
    expect(directory.get(url)?.liveConnections).toBe(0);
    const callsBeforeDispose = onMaxSubscriptions.mock.calls.length;
    bridge.dispose();

    directory.setNip11(url, { limitation: { max_subscriptions: 3 } });
    expect(onMaxSubscriptions).toHaveBeenCalledTimes(callsBeforeDispose);
  });

  test("provides no transport hooks when no directory is configured", () => {
    const url = normalizeRelayUrl("wss://relay.example.com")!;
    const onMaxSubscriptions = vi.fn();
    const bridge = new RelayDirectoryBridge(url, undefined, onMaxSubscriptions, vi.fn());

    expect(bridge.transportHooks).toEqual({});
    expect(onMaxSubscriptions).toHaveBeenCalledWith(undefined);
    bridge.dispose();
  });
});
