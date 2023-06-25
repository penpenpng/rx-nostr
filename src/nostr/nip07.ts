import { Nostr } from "./primitive";

declare global {
  interface Window {
    nostr?: Nostr.Nip07;
  }
}
