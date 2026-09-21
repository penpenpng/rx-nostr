import type { EventVerifier } from "./event-verifier.interface.ts";

export class NoopVerifier implements EventVerifier {
  async verifyEvent(): Promise<boolean> {
    return true;
  }
}
