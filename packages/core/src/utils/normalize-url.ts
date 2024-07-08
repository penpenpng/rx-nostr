import normalizeUrl from "normalize-url";

export function normalizeRelayUrl(url: string) {
  return normalizeUrl(url, {
    normalizeProtocol: false,
    removeTrailingSlash: true,
  });
}
