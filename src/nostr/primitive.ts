export namespace Nostr {
  export interface Event<K = number> {
    id: string;
    sig: string;
    kind: K;
    tags: string[][];
    pubkey: string;
    content: string;
    created_at: number;
  }

  export interface UnsignedEvent<K = number> {
    kind: K;
    tags: string[][];
    pubkey: string;
    content: string;
    created_at: number;
  }

  export interface EventParameters<K = number> {
    id?: string;
    sig?: string;
    kind: K;
    tags?: string[][];
    pubkey?: string;
    content: string;
    created_at?: number;
  }

  export enum Kind {
    Metadata = 0,
    Text = 1,
    RecommendRelay = 2,
    Contacts = 3,
    EncryptedDirectMessage = 4,
    EventDeletion = 5,
    Repost = 6,
    Reaction = 7,
    BadgeAward = 8,
    ChannelCreation = 40,
    ChannelMetadata = 41,
    ChannelMessage = 42,
    ChannelHideMessage = 43,
    ChannelMuteUser = 44,
    Blank = 255,
    Report = 1984,
    ZapRequest = 9734,
    Zap = 9735,
    RelayList = 10002,
    Auth = 22242,
    BadgeDefinition = 30008,
    ProfileBadge = 30009,
    Article = 30023,
  }

  type Chars<S extends string> = S extends `${infer Head}${infer Tail}`
    ? Uppercase<Head> | Lowercase<Head> | Chars<Tail>
    : never;
  // cf. NIP-12
  export type TagName = `#${Chars<"abcdefghijklmnopqrstuvwxyz">}`;
  export const isTagName = (str: string): str is TagName =>
    /^#[a-zA-Z]$/.test(str);

  export type Filter = {
    ids?: string[];
    kinds?: number[];
    authors?: string[];
    since?: number;
    until?: number;
    limit?: number;
  } & {
    [key in TagName]?: string[];
  };

  export namespace OutgoingMessage {
    export type Any = REQ | CLOSE | EVENT | AUTH;
    export type REQ = [type: "REQ", subId: string, ...filters: Filter[]];
    export type CLOSE = [type: "CLOSE", subId: string];
    export type EVENT = [type: "EVENT", event: Event];
    export type AUTH = [type: "AUTH", event: Event<Kind.Auth>];
  }

  export namespace IncomingMessage {
    export type Any = EVENT | EOSE | OK | AUTH;
    export type Sub = EVENT | EOSE;
    export type EVENT = [type: "EVENT", subId: string, event: Event];
    export type EOSE = [type: "EOSE", subId: string];
    export type OK = [
      type: "OK",
      eventId: string,
      rejected: boolean,
      message?: string
    ];
    export type AUTH = [type: "AUTH", challengeMessage: string];
    export type NOTICE = [type: "NOTICE", message: string];
  }

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
}
