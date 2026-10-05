import { map, tap } from "rxjs";
import { describe, expect, test, vi } from "vitest";

import { SubscriptionInspector } from "../__test__/helper/subscription-inspector.ts";
import { RelayDirectory, getRelayDirectoryReporter } from "./relay-directory.ts";

describe("RelayDirectory health reporter", () => {
  test("tracks independent live connections and resets failures on success", () => {
    let now = 1;
    const directory = new RelayDirectory({ clock: () => now });
    const reporter = getRelayDirectoryReporter(directory);

    reporter.connectionFailed("wss://relay.example.com");

    now = 2;

    reporter.connectionFailed("wss://relay.example.com");
    expect(directory.get("wss://relay.example.com")).toMatchObject({
      lastFailureAt: 2,
      consecutiveFailures: 2,
      liveConnections: 0,
    });

    now = 3;

    const closeFirst = reporter.connectionOpened("wss://relay.example.com");
    const closeSecond = reporter.connectionOpened("wss://RELAY.example.com/");

    expect(directory.get("wss://relay.example.com")).toMatchObject({
      lastConnectedAt: 3,
      consecutiveFailures: 0,
      liveConnections: 2,
    });

    closeFirst();
    closeFirst();
    expect(directory.get("wss://relay.example.com")?.liveConnections).toBe(1);
    closeSecond();
    expect(directory.get("wss://relay.example.com")?.liveConnections).toBe(0);
  });

  test("does not forget an entry while a connection or request is live", async () => {
    let finish!: (value: { name: string }) => void;
    const directory = new RelayDirectory({
      fetcher: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const reporter = getRelayDirectoryReporter(directory);
    const close = reporter.connectionOpened("wss://relay.example.com");

    expect(directory.forget("wss://relay.example.com")).toBe(false);
    close();
    const fetching = directory.fetchNip11("wss://relay.example.com");

    expect(directory.forget("wss://relay.example.com")).toBe(false);
    finish({ name: "relay" });
    await fetching;
    expect(directory.forget("wss://relay.example.com")).toBe(true);
    expect(directory.get("wss://relay.example.com")).toBeUndefined();
  });

  test("gives each observer mutable detached snapshots", async () => {
    let now = 10;
    const directory = new RelayDirectory({ clock: () => now });
    const inspector = new SubscriptionInspector<number>();
    const observed = directory.observe("wss://relay.example.com");
    const mutatingInspector = new SubscriptionInspector<unknown>();
    const mutatingSub = observed
      .pipe(
        tap((entry) => {
          entry.consecutiveFailures = 100;
        }),
      )
      .subscribe(mutatingInspector);
    const sub = observed.pipe(map((entry) => entry.consecutiveFailures)).subscribe(inspector);
    const reporter = getRelayDirectoryReporter(directory);

    reporter.connectionFailed("wss://relay.example.com");

    now = 11;

    reporter.connectionOpened("wss://relay.example.com");

    await expect(inspector.waitNext()).resolves.toEqual(0);
    await expect(inspector.waitNext()).resolves.toEqual(1);
    await expect(inspector.waitNext()).resolves.toEqual(0);
    mutatingSub.unsubscribe();
    sub.unsubscribe();
  });

  test("detaches nested NIP-11 data for each observer and read", () => {
    const url = "wss://relay.example.com";
    const directory = new RelayDirectory();

    directory.setNip11(url, { name: "relay", limitation: { max_subscriptions: 3 } });

    const seen: number[] = [];
    const stream = directory.observe(url);
    const first = stream.subscribe((entry) => {
      if (entry.nip11?.limitation) {
        entry.nip11.limitation.max_subscriptions = 100;
      }
    });
    const second = stream.subscribe((entry) => {
      seen.push(entry.nip11?.limitation?.max_subscriptions ?? -1);
    });

    expect(seen).toEqual([3]);
    expect(directory.get(url)?.nip11?.limitation?.max_subscriptions).toBe(3);

    first.unsubscribe();
    second.unsubscribe();
  });
});

describe("RelayDirectory snapshots", () => {
  test("merges streak starts without including failures before an imported success", () => {
    const directory = new RelayDirectory();
    const merge = (entry: object) =>
      directory.importSnapshot(
        JSON.stringify({ version: 1, relays: [{ url: "wss://relay.example.com", ...entry }] }),
      );

    merge({ firstFailureAt: 0, lastFailureAt: 50, consecutiveFailures: 2 });
    merge({ firstFailureAt: 20, lastFailureAt: 100, consecutiveFailures: 3 });
    expect(directory.get("wss://relay.example.com")?.firstFailureAt).toBe(0);
    merge({ lastConnectedAt: 80, firstFailureAt: 90, lastFailureAt: 100, consecutiveFailures: 1 });
    expect(directory.get("wss://relay.example.com")?.firstFailureAt).toBe(90);
    expect(() => new RelayDirectory().importSnapshot(directory.exportSnapshot())).not.toThrow();
  });

  test("round trips a manually cleared failure streak and rejects inconsistent firstFailureAt", () => {
    const source = new RelayDirectory({ clock: () => 100 });

    getRelayDirectoryReporter(source).connectionFailed("wss://relay.example.com");
    source.resetHealth("wss://relay.example.com");
    const restored = new RelayDirectory();

    restored.importSnapshot(source.exportSnapshot());
    expect(restored.get("wss://relay.example.com")?.firstFailureAt).toBeUndefined();
    expect(() => source.importSnapshot(restored.exportSnapshot())).not.toThrow();
    const before = restored.exportSnapshot();

    expect(() =>
      restored.importSnapshot(
        JSON.stringify({
          version: 1,
          relays: [
            {
              url: "wss://relay.example.com",
              firstFailureAt: 200,
              lastFailureAt: 100,
              consecutiveFailures: 2,
            },
          ],
        }),
      ),
    ).toThrow();
    expect(restored.exportSnapshot()).toBe(before);
  });

  test("round trips persistent data without live connection state", () => {
    let now = 10;
    const source = new RelayDirectory({ clock: () => now });
    const sourceReporter = getRelayDirectoryReporter(source);

    source.setNip11("wss://relay.example.com", {
      name: "relay",
      limitation: { max_subscriptions: 5 },
    });

    now = 20;

    sourceReporter.connectionFailed("wss://relay.example.com");

    now = 30;

    const close = sourceReporter.connectionOpened("wss://relay.example.com");
    const serialized = source.exportSnapshot();

    expect(serialized).not.toContain("liveConnections");
    const target = new RelayDirectory();

    target.importSnapshot(serialized);
    expect(target.get("wss://relay.example.com")).toMatchObject({
      nip11: { name: "relay", limitation: { max_subscriptions: 5 } },
      nip11FetchedAt: 10,
      lastFailureAt: 20,
      lastConnectedAt: 30,
      consecutiveFailures: 0,
      liveConnections: 0,
      maxSubscriptions: 5,
    });
    close();
  });

  test("merge preserves newer live data and live connection counts", () => {
    const now = 100;
    const directory = new RelayDirectory({ clock: () => now });
    const reporter = getRelayDirectoryReporter(directory);
    const close = reporter.connectionOpened("wss://relay.example.com");

    directory.setNip11("wss://relay.example.com", { name: "new" });

    directory.importSnapshot(
      JSON.stringify({
        version: 1,
        relays: [
          {
            url: "wss://relay.example.com",
            nip11: { name: "old" },
            nip11FetchedAt: 50,
            lastFailureAt: 60,
            consecutiveFailures: 4,
          },
        ],
      }),
    );

    expect(directory.get("wss://relay.example.com")).toMatchObject({
      nip11: { name: "new" },
      lastConnectedAt: 100,
      lastFailureAt: 60,
      consecutiveFailures: 0,
      liveConnections: 1,
    });
    close();
  });

  test("records failed NIP-11 fetch time without discarding cached metadata", async () => {
    let now = 1;
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const directory = new RelayDirectory({ clock: () => now, fetcher });

    directory.setNip11("wss://relay.example.com", { name: "cached" });

    now = 2;

    await expect(
      directory.fetchNip11("wss://relay.example.com", { refresh: true }),
    ).rejects.toThrow("offline");
    expect(directory.get("wss://relay.example.com")).toMatchObject({
      nip11: { name: "cached" },
      nip11FetchedAt: 1,
      nip11FailedAt: 2,
    });
  });

  test("times out NIP-11 fetches and records the failure", async () => {
    const directory = new RelayDirectory({
      clock: () => 3,
      fetcher: () => new Promise(() => {}),
    });

    await expect(
      directory.fetchNip11("wss://relay.example.com", { timeout: 0 }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(directory.get("wss://relay.example.com")).toMatchObject({ nip11FailedAt: 3 });
  });

  test.each([NaN, -Infinity, -1, 2_147_483_648])(
    "rejects invalid NIP-11 timeout before starting fetch: %s",
    async (timeout) => {
      const fetcher = vi.fn();
      const directory = new RelayDirectory({ fetcher });

      await expect(directory.fetchNip11("wss://relay.example.com", { timeout })).rejects.toThrow(
        RangeError,
      );
      expect(fetcher).not.toHaveBeenCalled();
      expect(directory.get("wss://relay.example.com")).toBeUndefined();
    },
  );
});

test("round trips success followed by failure at the same timestamp", () => {
  const directory = new RelayDirectory({ clock: () => 100 });
  const reporter = getRelayDirectoryReporter(directory);

  reporter.connectionOpened("wss://relay.example.com")();
  reporter.connectionFailed("wss://relay.example.com");
  const restored = new RelayDirectory();

  restored.importSnapshot(directory.exportSnapshot());
  expect(restored.get("wss://relay.example.com")).toMatchObject({
    consecutiveFailures: 1,
    firstFailureAt: 100,
    lastFailureAt: 100,
    lastConnectedAt: 100,
  });
});
