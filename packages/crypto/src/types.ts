import * as Nostr from "nostr-typedef";

export interface VerificationRequest {
  reqId: number;
  event: Nostr.Event;
}

export interface VerificationResponse {
  reqId: number;
  ok: boolean;
  error?: string;
}
