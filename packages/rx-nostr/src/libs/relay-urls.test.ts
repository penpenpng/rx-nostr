import { expect, test } from "vitest";

import { setDiagnosticSink, type RxNostrDiagnostic } from "../diagnostics/index.ts";
import { normalizeRelayUrl, RelayMap, RelayMapOperator, RelaySet } from "./relay-urls.ts";

const relaySet = (...urls: string[]) => new RelaySet(urls);

test(normalizeRelayUrl.name, () => {
  const f = normalizeRelayUrl;

  // Trim trailing slash and dot
  expect(f("ws://example.com/")).toBe("ws://example.com");
  expect(f("ws://example.com.")).toBe("ws://example.com");
  expect(f("ws://example.com/path/")).toBe("ws://example.com/path");

  // Trim hash
  expect(f("wss://example.com/#/")).toBe("wss://example.com");
  expect(f("wss://example.com/#/test")).toBe("wss://example.com");

  // Sort query parameters
  expect(f("wss://example.com/?b=1&a=1")).toBe("wss://example.com?a=1&b=1");
  expect(f("wss://example.com/?a=1")).toBe(f("wss://example.com?a=1"));

  // Invalid URL
  expect(f("invalid-url")).toBe(null);
  expect(f("wss:://example.com")).toBe(null);
  expect(f("//example.com")).toBe(null);
  expect(f("example.com")).toBe(null);
  expect(f("wss://")).toBe(null);
  expect(f("")).toBe(null);
  expect(f(undefined as any)).toBe(null);
  expect(f(0 as any)).toBe(null);
});

test("normalization preserves query values and repeated-key order", () => {
  const cases = [
    ["token=a%26b%3Dc", "a&b=c"],
    ["token=a%2Bb", "a+b"],
    ["token=a+b", "a b"],
    ["token=%25", "%"],
    ["token=%E3%81%82", "あ"],
    ["token=", ""],
    ["token=%2526", "%26"],
  ] as const;

  for (const [query, expected] of cases) {
    const normalized = normalizeRelayUrl(`wss://relay.example.com?${query}`);

    expect(normalized).not.toBeNull();
    expect(new URL(normalized!).searchParams.get("token")).toBe(expected);
    expect(normalizeRelayUrl(normalized!)).toBe(normalized);
  }

  const repeated = normalizeRelayUrl("wss://relay.example.com?z=1&token=first&token=second&a=2");

  expect(new URL(repeated!).searchParams.getAll("token")).toEqual(["first", "second"]);
  expect(repeated).toBe("wss://relay.example.com?a=2&token=first&token=second&z=1");
  expect(normalizeRelayUrl("wss://relay.example.com?token=%ZZ")).toBe(
    "wss://relay.example.com?token=%25ZZ",
  );
});

test("RelayMap and RelaySet keep distinct query credentials separate", () => {
  const encoded = "wss://relay.example.com?token=a%26b%3Dc";
  const split = "wss://relay.example.com?token=a&b=c";
  const plus = "wss://relay.example.com?token=a%2Bb";
  const space = "wss://relay.example.com?token=a+b";
  const map = new RelayMap<number>();
  const set = new RelaySet([encoded, split, plus, space]);

  for (const [index, url] of [encoded, split, plus, space].entries()) {
    map.set(url, index);
  }

  expect(map.size).toBe(4);
  expect(set.size).toBe(4);
  expect(map.get(encoded)).toBe(0);
  expect(map.get(split)).toBe(1);
  expect(map.get(plus)).toBe(2);
  expect(map.get(space)).toBe(3);
});

test(RelayMap.name, () => {
  const relay = "wss://example.com";
  const alias = "wss://example.com/";
  const another = "wss://another.example.com";
  const invalid = "invalid-url";

  const map = new RelayMap<number>();

  // Add and retrieve values
  map.set(relay, 1);
  expect(map.get(relay)).toBe(1);
  expect(map.get(alias)).toBe(1);
  expect(map.size).toBe(1);

  // Overwrite value
  map.set(alias, 2);
  expect(map.get(relay)).toBe(2);
  expect(map.get(alias)).toBe(2);
  expect(map.size).toBe(1);

  // Add another value
  map.set(another, 3);
  expect(map.get(another)).toBe(3);
  expect(map.size).toBe(2);

  // Invalid URL should not be added
  map.set(invalid, 4);
  expect(map.size).toBe(2);

  // Existence check
  expect(map.has(relay)).toBe(true);
  expect(map.has(alias)).toBe(true);
  expect(map.has(another)).toBe(true);
  expect(map.has(invalid)).toBe(false);

  // Delete a value
  map.delete(relay);
  expect(map.get(relay)).toBe(undefined);
  expect(map.get(alias)).toBe(undefined);

  // Clear the map
  map.clear();
  expect(map.size).toBe(0);
});

test(RelaySet.name, () => {
  const relay = "wss://example.com";
  const alias = "wss://example.com/";
  const another = "wss://another.example.com";
  const invalid = "invalid-url";

  const set = new RelaySet();

  // Add values
  set.add(relay);
  expect(set.has(relay)).toBe(true);
  expect(set.has(alias)).toBe(true);
  expect(set.size).toBe(1);

  // Add another value
  set.add(another);
  expect(set.has(another)).toBe(true);
  expect(set.size).toBe(2);

  // Invalid URL should not be added
  set.add(invalid);
  expect(set.has(invalid)).toBe(false);
  expect(set.size).toBe(2);

  // Delete a value
  set.delete(relay);
  expect(set.has(relay)).toBe(false);
  expect(set.has(alias)).toBe(false);
  expect(set.size).toBe(1);

  // Clear the set
  set.clear();
  expect(set.size).toBe(0);
  expect(set.has(another)).toBe(false);
  expect(set.has(relay)).toBe(false);
  expect(set.has(alias)).toBe(false);

  // Set operation
  expect(relaySet(relay, another).difference(relaySet(alias)).size).toBe(1);
  expect(relaySet(relay).intersection(relaySet(alias)).size).toBe(1);
  expect(relaySet(relay).intersection(relaySet()).size).toBe(0);
  expect(relaySet(relay).union(relaySet(alias)).size).toBe(1);
});

test(`${RelayMapOperator.name} reports swallowed callback failures synchronously`, () => {
  const relay = "wss://example.com";
  const cause = new Error("factory failed");
  const diagnostics: RxNostrDiagnostic[] = [];

  setDiagnosticSink((log) => diagnostics.push(log));
  const relays = new RelayMapOperator<never>(() => {
    throw cause;
  });

  try {
    relays.forEach([relay], () => {});
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      level: "error",
      event: "relay-collection/callback-failed",
      message: "A callback used by a relay collection forEach operation failed.",
      cause,
      context: { relay, operation: "forEach" },
    });
  } finally {
    setDiagnosticSink(undefined);
  }
});
