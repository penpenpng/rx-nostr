import { Nostr } from "./nostr/primitive";
import { EventMessageNotification } from "./type";

export function extractEvent(
  x: EventMessageNotification | Nostr.IncomingMessage.EVENT
) {
  return ("message" in x ? x.message : x)[2];
}
