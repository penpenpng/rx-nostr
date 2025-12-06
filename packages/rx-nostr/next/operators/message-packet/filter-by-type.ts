import type * as Nostr from "nostr-typedef";
import { filter, type OperatorFunction } from "rxjs";
import type { MessagePacket } from "../../packets/index.ts";

export function filterByType<T extends Nostr.ToClientMessage.Type>(
  type: T,
): OperatorFunction<MessagePacket, MessagePacket & { type: T }> {
  return filter(
    (packet): packet is MessagePacket & { type: T } => packet.type === type,
  );
}
