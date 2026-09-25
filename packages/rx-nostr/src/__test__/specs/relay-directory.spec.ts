import { describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  RelayDirectory,
  RelayDirectorySnapshotError,
  fetchRelayInfo,
  type IRelayDirectory,
  type RelayDirectoryEntry,
  type RxNostrConfig,
} from "rx-nostr";
import {
  createDeferred,
  createRxNostrScenario,
  expectCallbackCalled,
  expectSocketCloseRequested,
} from "../helper/index.ts";

const relay = "wss://relay.example.com";

async function expectRelayInfo(
  directory: RelayDirectory,
  url: string,
  expected: unknown,
): Promise<void> {
  await vi.waitFor(() => expect(directory.get(url)?.nip11).toEqual(expected));
}

describe("RelayDirectory public contract", () => {
  describe("RxNostr integration", () => {
    test("populates metadata on first use", async () => {
      const fetcher = vi.fn().mockResolvedValue({ name: "relay" });
      const directory = new RelayDirectory({ fetcher });
      const { server, rxNostr } = createRxNostrScenario({
        relayDirectory: directory,
        skipFetchNip11: false,
      });

      rxNostr.setHotRelays([relay]);

      await expectCallbackCalled(fetcher);
      await expectRelayInfo(directory, relay, { name: "relay" });

      rxNostr.unsetHotRelays();
      await expectSocketCloseRequested(server.sockets.latest);
      server.sockets.latest.acknowledgeClose();
      rxNostr.dispose();
    });

    test("skips metadata fetching when configured", async () => {
      const fetcher = vi.fn().mockResolvedValue({ name: "relay" });
      const directory = new RelayDirectory({ fetcher });
      const { server, rxNostr } = createRxNostrScenario({
        relayDirectory: directory,
        skipFetchNip11: true,
      });

      rxNostr.setHotRelays([relay]);
      await Promise.resolve();

      expect(fetcher).not.toHaveBeenCalled();

      rxNostr.unsetHotRelays();
      await expectSocketCloseRequested(server.sockets.latest);
      server.sockets.latest.acknowledgeClose();
      rxNostr.dispose();
    });
  });

  describe("entries and snapshots", () => {
    test("normalizes aliases and exposes mutable detached read snapshots", () => {
      const directory: IRelayDirectory = new RelayDirectory({ clock: () => 10 });
      const first = directory.getOrCreate("wss://RELAY.example.com/");
      const second = directory.getOrCreate("wss://relay.example.com");

      expect(first.url).toBe("wss://relay.example.com");
      expect(second.url).toBe(first.url);
      expect([...directory]).toHaveLength(1);
      expect(Object.isFrozen(first)).toBe(false);

      first.consecutiveFailures = 10;

      expect(second.consecutiveFailures).toBe(0);
      expect(directory.get(first.url)?.consecutiveFailures).toBe(0);
      expect(first).not.toHaveProperty("retry");
      expect(first).not.toHaveProperty("socket");
      expectTypeOf<RelayDirectoryEntry>().not.toHaveProperty("retry");
      expectTypeOf<RxNostrConfig>().toHaveProperty("relayDirectory");
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

  describe("NIP-11 cache", () => {
    test("deduplicates concurrent requests and caches their result", async () => {
      const response = createDeferred<{
        name: string;
        limitation: { max_subscriptions: number };
      }>();
      const fetcher = vi.fn(() => response.promise);
      const directory = new RelayDirectory({ clock: () => 20, fetcher });

      const first = directory.fetchNip11(relay);
      const second = directory.fetchNip11("wss://RELAY.example.com/");

      expect(fetcher).toHaveBeenCalledOnce();

      response.resolve({ name: "relay", limitation: { max_subscriptions: 3 } });

      await expect(first).resolves.toMatchObject({ name: "relay" });
      await expect(second).resolves.toMatchObject({ name: "relay" });
      expect(directory.get(relay)).toMatchObject({
        nip11FetchedAt: 20,
        maxSubscriptions: 3,
      });

      await directory.fetchNip11(relay);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    test("refreshes cached metadata and supports manual replacement", async () => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce({ name: "initial" })
        .mockResolvedValueOnce({ name: "refreshed", limitation: { max_subscriptions: 4 } });
      const directory = new RelayDirectory({ fetcher });
      await directory.fetchNip11(relay);

      await expect(directory.fetchNip11(relay, { refresh: true })).resolves.toMatchObject({
        name: "refreshed",
      });
      expect(fetcher).toHaveBeenCalledTimes(2);

      const installed = directory.setNip11(relay, { name: "manual" });
      installed.name = "consumer change";
      expect(directory.get(relay)?.nip11).toEqual({ name: "manual" });
    });
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
