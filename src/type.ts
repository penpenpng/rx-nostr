import { Nostr } from "./nostr/primitive";

export interface AnyMessageNotification {
  from: string;
  message: Nostr.IncomingMessage.Any;
}

export interface EventMessageNotification {
  from: string;
  message: Nostr.IncomingMessage.EVENT;
}

export interface ErrorNotification {
  from: string;
  error: unknown;
}
