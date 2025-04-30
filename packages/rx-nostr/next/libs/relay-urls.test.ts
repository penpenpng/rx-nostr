import { expect, test } from "vitest";

import { normalizeRelayUrl, RelayMap, RelaySet } from "./relay-urls.ts";

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
  expect(f("wss://example.com/?b=1&a=1")).toBe("wss://example.com/?a=1&b=1");

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

  const s = (...urls: string[]) => new RelaySet(urls);

  // Set operation
  expect(s(relay, another).difference(s(alias)).size).toBe(1);
  expect(s(relay).intersection(s(alias)).size).toBe(1);
  expect(s(relay).intersection(s()).size).toBe(0);
  expect(s(relay).union(s(alias)).size).toBe(1);
});
