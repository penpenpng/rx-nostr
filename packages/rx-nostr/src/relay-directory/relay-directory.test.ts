import { describe, expect, test, vi } from "vitest";
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

  test("gives each observer mutable detached snapshots", () => {
    let now = 10;
    const directory = new RelayDirectory({ clock: () => now });
    const values: number[] = [];
    const observed = directory.observe("wss://relay.example.com");
    const mutatingSub = observed.subscribe((entry) => {
      entry.consecutiveFailures = 100;
    });
    const sub = observed.subscribe((entry) => values.push(entry.consecutiveFailures));
    const reporter = getRelayDirectoryReporter(directory);

    reporter.connectionFailed("wss://relay.example.com");
    now = 11;
    reporter.connectionOpened("wss://relay.example.com");

    expect(values).toEqual([0, 1, 0]);
    mutatingSub.unsubscribe();
    sub.unsubscribe();
  });
});

describe("RelayDirectory snapshots", () => {
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
});
