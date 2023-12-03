import Nostr from "nostr-typedef";
import { filter, map, type OperatorFunction, pipe } from "rxjs";

import type {
  EventPacket,
  LazyFilter,
  LazyREQ,
  MessagePacket,
} from "../packet.js";
import type { RxReq } from "../req.js";
import type {
  AcceptableDefaultRelaysConfig,
  DefaultRelayConfig,
} from "./interface.js";

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

export function pickEvent(
  subId: string
): OperatorFunction<MessagePacket<Nostr.ToClientMessage.EVENT>, EventPacket> {
  return pipe(
    filter(({ message }) => message[1] === subId),
    map(({ from, message }) => ({
      from,
      subId: message[1],
      event: message[2],
    }))
  );
}

export function normalizeRelaysConfig(
  config: AcceptableDefaultRelaysConfig
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
