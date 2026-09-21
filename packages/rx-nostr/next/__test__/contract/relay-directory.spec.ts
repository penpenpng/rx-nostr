import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  RelayDirectory,
  RelayDirectorySnapshotError,
  NoopVerifier,
  createRxNostr,
  fetchRelayInfo,
  type IRelayDirectory,
  type RelayDirectoryEntry,
  type RxNostrConfig,
} from "rx-nostr";
import { ContractWebSocketServer } from "./support/controlled-websocket.ts";

describe("RelayDirectory public contract", () => {
  test("RxNostr populates metadata on first use unless fetching is skipped", async () => {
    const fetcher = vi.fn().mockResolvedValue({ name: "relay" });
    const directory = new RelayDirectory({ fetcher });
    const server = new ContractWebSocketServer();
    const rxNostr = createRxNostr({
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      WebSocket: server.WebSocket,
    });
    rxNostr.setHotRelays(["wss://relay.example.com"]);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(directory.get("wss://relay.example.com")?.nip11).toEqual({
        name: "relay",
      }),
    );
    rxNostr.unsetHotRelays();
    await vi.waitFor(() =>
      expect(server.current.closeRequests).toHaveLength(1),
    );
    server.current.acknowledgeClose();
    rxNostr.dispose();

    const skippedServer = new ContractWebSocketServer();
    const skipped = createRxNostr({
      verifier: new NoopVerifier(),
      relayDirectory: directory,
      skipFetchNip11: true,
      WebSocket: skippedServer.WebSocket,
    });
    skipped.setHotRelays(["wss://skipped.example.com"]);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledOnce();
    skipped.unsetHotRelays();
    await vi.waitFor(() =>
      expect(skippedServer.current.closeRequests).toHaveLength(1),
    );
    skippedServer.current.acknowledgeClose();
    skipped.dispose();
  });

  test("normalizes aliases and exposes immutable read snapshots", () => {
    const directory: IRelayDirectory = new RelayDirectory({ clock: () => 10 });
    const first = directory.getOrCreate("wss://RELAY.example.com/");
    const second = directory.getOrCreate("wss://relay.example.com");

    expect(first.url).toBe("wss://relay.example.com");
    expect(second.url).toBe(first.url);
    expect([...directory]).toHaveLength(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).not.toHaveProperty("retry");
    expect(first).not.toHaveProperty("socket");
    expectTypeOf<RelayDirectoryEntry>().not.toHaveProperty("retry");
    expectTypeOf<RxNostrConfig>().toHaveProperty("relayDirectory");
  });

  test("deduplicates NIP-11 requests, caches them, and supports refresh/manual set", async () => {
    let resolve!: (value: {
      name: string;
      limitation: { max_subscriptions: number };
    }) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<{
          name: string;
          limitation: { max_subscriptions: number };
        }>((done) => {
          resolve = done;
        }),
    );
    const directory = new RelayDirectory({ clock: () => 20, fetcher });

    const first = directory.fetchNip11("wss://relay.example.com");
    const second = directory.fetchNip11("wss://RELAY.example.com/");
    expect(fetcher).toHaveBeenCalledOnce();
    resolve({ name: "relay", limitation: { max_subscriptions: 3 } });
    await expect(first).resolves.toMatchObject({ name: "relay" });
    await expect(second).resolves.toMatchObject({ name: "relay" });
    expect(directory.get("wss://relay.example.com")).toMatchObject({
      nip11FetchedAt: 20,
      maxSubscriptions: 3,
    });

    await directory.fetchNip11("wss://relay.example.com");
    expect(fetcher).toHaveBeenCalledOnce();

    fetcher.mockResolvedValue({
      name: "refreshed",
      limitation: { max_subscriptions: 4 },
    });
    await expect(
      directory.fetchNip11("wss://relay.example.com", { refresh: true }),
    ).resolves.toMatchObject({ name: "refreshed" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    directory.setNip11("wss://relay.example.com", { name: "manual" });
    expect(directory.get("wss://relay.example.com")?.nip11).toEqual({
      name: "manual",
    });
  });

  test("rejects malformed snapshots atomically with typed errors", () => {
    const directory = new RelayDirectory();
    directory.setNip11("wss://existing.example.com", { name: "existing" });
    const before = directory.exportSnapshot();

    expect(() => directory.importSnapshot("not-json")).toThrowError(
      expect.objectContaining({ code: "invalid-json" }),
    );
    expect(() =>
      directory.importSnapshot(JSON.stringify({ version: 2, relays: [] })),
    ).toThrowError(expect.objectContaining({ code: "unsupported-version" }));
    expect(() =>
      directory.importSnapshot(
        JSON.stringify({
          version: 1,
          relays: [
            {
              url: "wss://valid.example.com",
              consecutiveFailures: 0,
            },
            { url: "invalid", consecutiveFailures: 0 },
          ],
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid-schema" }));

    expect(directory.exportSnapshot()).toBe(before);
    expectTypeOf<RelayDirectorySnapshotError>().toHaveProperty("code");
  });
});

describe("fetchRelayInfo", () => {
  test("uses the NIP-11 HTTP endpoint and media type", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ name: "relay" }),
    });

    await expect(
      fetchRelayInfo("wss://relay.example.com/path", {
        fetch: fetch as typeof globalThis.fetch,
      }),
    ).resolves.toEqual({ name: "relay" });
    expect(fetch).toHaveBeenCalledWith("https://relay.example.com/path", {
      headers: { Accept: "application/nostr+json" },
    });
  });

  test.each([
    ["network", vi.fn().mockRejectedValue(new Error("offline"))],
    ["status", vi.fn().mockResolvedValue({ ok: false, status: 503 })],
    [
      "parse",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("bad json")),
      }),
    ],
    [
      "invalid-response",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      }),
    ],
  ])("distinguishes %s failures", async (code, fetch) => {
    await expect(
      fetchRelayInfo("wss://relay.example.com", {
        fetch: fetch as typeof globalThis.fetch,
      }),
    ).rejects.toMatchObject({
      name: "RxNostrNip11Error",
      code,
    });
  });
});
