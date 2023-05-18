export interface Nip07 {
  getPublicKey: () => Promise<string>;
  signEvent: (event: {
    kind: number;
    tags: string[][];
    content: string;
    created_at: number;
  }) => Promise<{
    id: string;
    sig: string;
    kind: number;
    tags: string[][];
    pubkey: string;
    content: string;
    created_at: number;
  }>;
  getRelays(): Promise<{ [url: string]: { read: boolean; write: boolean } }>;
}

declare global {
  interface Window {
    nostr?: Nip07;
  }
}
