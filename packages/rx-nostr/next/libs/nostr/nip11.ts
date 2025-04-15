import type * as Nostr from "nostr-typedef";

/**
 * Fetch relay's information based on [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md).
 */
export async function fetchRelayInfo(url: string): Promise<Nostr.Nip11.RelayInfo> {
  try {
    const u = new URL(url);
    u.protocol = u.protocol.replace(/^ws(s?):/, "http$1:");

    const res = await fetch(u.toString(), {
      headers: { Accept: "application/nostr+json" },
    });
    return await res.json();
  } catch {
    return {};
  }
}
