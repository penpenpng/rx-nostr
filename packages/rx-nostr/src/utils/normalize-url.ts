import { inlineTry } from "./inline-try.js";

export function normalizeRelayUrl(url: string) {
  let o = "";

  try {
    o = url.trim();

    const u = new URL(o);

    u.hash = "";
    u.pathname = inlineTry(() => decodeURI(u.pathname), u.pathname);
    u.pathname = u.pathname.replace(/\/$/, "");
    u.hostname = u.hostname.replace(/\.$/, "");
    u.searchParams.sort();
    u.search = inlineTry(() => decodeURIComponent(u.search), u.search);

    let s = u.toString();
    if (!u.search) {
      s = s.replace(/\/$/, "");
    }

    return s;
  } catch {
    return o;
  }
}
