import Nostr from "nostr-typedef";

declare global {
  interface Window {
    nostr?: Nostr.Nip07.Nostr;
  }
}
