interface Window {
  nostr?: {
    getPublicKey: () => string;
    signEvent: (event: {
      kind: number;
      tags: string[][];
      pubkey: string;
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
  };
}
