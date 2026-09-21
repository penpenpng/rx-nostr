import type * as Nostr from "nostr-typedef";
import { RxNostrNip11Error } from "../error.ts";

export interface FetchRelayInfoOptions {
  readonly fetch?: typeof globalThis.fetch;
}

/** Fetch relay information according to NIP-11. */
export async function fetchRelayInfo(
  url: string,
  options: FetchRelayInfoOptions = {},
): Promise<Nostr.Nip11.RelayInfo> {
  let endpoint: URL;
  try {
    endpoint = new URL(url);
    if (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") {
      throw new TypeError("Relay URLs must use ws: or wss:.");
    }
    endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
  } catch (cause) {
    throw new RxNostrNip11Error(
      "invalid-url",
      `Invalid relay URL: ${url}`,
      undefined,
      {
        cause,
      },
    );
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetcher(endpoint.toString(), {
      headers: { Accept: "application/nostr+json" },
    });
  } catch (cause) {
    throw new RxNostrNip11Error(
      "network",
      `Failed to fetch relay information from ${url}.`,
      undefined,
      { cause },
    );
  }

  if (!response.ok) {
    throw new RxNostrNip11Error(
      "status",
      `Relay information request returned HTTP ${response.status}.`,
      response.status,
    );
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch (cause) {
    throw new RxNostrNip11Error(
      "parse",
      "Relay information was not valid JSON.",
      response.status,
      { cause },
    );
  }

  if (!isObject(value)) {
    throw new RxNostrNip11Error(
      "invalid-response",
      "Relay information must be a JSON object.",
      response.status,
    );
  }
  return value as Nostr.Nip11.RelayInfo;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
