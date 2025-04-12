import { expect, test } from "vitest";

import { normalizeWebSocketUrl } from "./websocket-url.ts";

test("normalizeWebSocketUrl()", () => {
  const f = normalizeWebSocketUrl;

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
