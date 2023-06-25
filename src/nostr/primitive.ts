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

  export namespace Nip11 {
    export interface RelayInfo {
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#name */
      name?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#description */
      description?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#pubkey */
      pubkey?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#contact */
      contact?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#supported-nips */
      supported_nips?: number[];
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#software */
      software?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#version */
      version?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#server-limitations */
      limitation?: ServerLimitations;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#event-retention */
      retention?: EventRetention[];
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#content-limitations */
      relay_countries?: string[];
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#community-preferences */
      language_tags?: string[];
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#community-preferences */
      tags?: string[];
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#community-preferences */
      posting_policy?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#pay-to-relay */
      payments_url?: string;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#pay-to-relay */
      fees?: RelayFees;
      /** https://github.com/nostr-protocol/nips/blob/master/11.md#icon */
      icon?: string;
      [key: string]: unknown;
    }

    export interface ServerLimitations {
      max_message_length?: number;
      max_subscriptions?: number;
      max_filters?: number;
      max_limit?: number;
      max_subid_length?: number;
      min_prefix?: number;
      max_event_tags?: number;
      max_content_length?: number;
      min_pow_difficulty?: number;
      auth_required?: boolean;
      payment_required?: boolean;
    }

    export interface EventRetention {
      kinds?: (number | [start: number, end: number])[];
      time?: number | null;
      count?: number;
    }

    export interface RelayFees {
      admission?: RelayFeeAmount[];
      subscription?: RelayFeeAmount[];
      publication?: RelayFeeAmount[];
    }

    export interface RelayFeeAmount {
      amount?: number;
      unit?: string;
      period?: number;
      kinds?: number[];
    }
  }
}
