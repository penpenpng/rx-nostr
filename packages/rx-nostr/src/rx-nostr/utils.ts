import type { LazyFilter, LazyREQ } from "../packet.js";
import { normalizeRelayUrl } from "../utils/normalize-url.js";
import type {
  AcceptableDefaultRelaysConfig,
  DefaultRelayConfig,
  RxNostr,
  RxNostrOnParams,
} from "./interface.js";
import type { RxReq } from "./rx-req.js";

export function makeSubId(params: { rxReq: RxReq; index: number }): string {
  const { rxReq, index } = params;
  const { rxReqId, strategy } = rxReq;

  const childId = strategy === "backward" ? index : 0;

  return `${rxReqId}:${childId}`;
}

export function makeLazyREQ(params: {
  rxReq: RxReq;
  filters: LazyFilter[];
  index: number;
}): LazyREQ {
  const { rxReq, filters, index } = params;

  return ["REQ", makeSubId({ rxReq, index }), ...filters];
}

export function normalizeRelaysConfig(
  config: AcceptableDefaultRelaysConfig,
): Record<string, DefaultRelayConfig> {
  if (Array.isArray(config)) {
    const arr = config.map((urlOrConfig) => {
      let url = "";
      let read = false;
      let write = false;
      if (typeof urlOrConfig === "string") {
        url = urlOrConfig;
        read = true;
        write = true;
      } else if (Array.isArray(urlOrConfig)) {
        const mode = urlOrConfig[2];
        url = urlOrConfig[1];
        read = !mode || mode === "read";
        write = !mode || mode === "write";
      } else {
        url = urlOrConfig.url;
        read = urlOrConfig.read;
        write = urlOrConfig.write;
      }

      return {
        url,
        read,
        write,
      };
    });

    return Object.fromEntries(arr.map((e) => [e.url, e]));
  } else {
    const arr = Object.entries(config).map(([url, flags]) => ({
      url,
      ...flags,
    }));

    return Object.fromEntries(arr.map((e) => [e.url, e]));
  }
}

export function getMethodScopeRelays(
  rxNostr: RxNostr,
  options?: {
    relays?: string[];
    on?: RxNostrOnParams;
  },
): string[] | undefined {
  const targets = new Set<string>();

  if (options?.on) {
    const on = options.on;

    if (!on.defaultReadRelays && !on.defaultWriteRelays && !on.relays) {
      return undefined;
    }

    const defaultRelays = rxNostr.getDefaultRelays();

    if (on.defaultReadRelays) {
      for (const { url } of Object.values(defaultRelays).filter(
        (e) => e.read,
      )) {
        targets.add(url);
      }
    }
    if (on.defaultWriteRelays) {
      for (const { url } of Object.values(defaultRelays).filter(
        (e) => e.write,
      )) {
        targets.add(url);
      }
    }
    if (on.relays) {
      for (const url of on.relays) {
        targets.add(normalizeRelayUrl(url));
      }
    }

    return [...targets];
  } else if (options?.relays) {
    for (const url of options.relays) {
      targets.add(normalizeRelayUrl(url));
    }

    return [...targets];
  } else {
    return undefined;
  }
}
