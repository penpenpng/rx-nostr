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
    kind: K;
    tags?: string[][];
    pubkey: string;
    content: string;
  }

  export enum Kind {
    Metadata = 0,
    Text = 1,
    RecommendRelay = 2,
    Contacts = 3,
    EncryptedDirectMessage = 4,
    EventDeletion = 5,
    Reaction = 7,
    ChannelCreation = 40,
    ChannelMetadata = 41,
    ChannelMessage = 42,
    ChannelHideMessage = 43,
    ChannelMuteUser = 44,
    Auth = 22242,
  }

  export type TagName = `#${string}`;

  export interface Filter {
    ids?: string[];
    kinds?: number[];
    authors?: string[];
    since?: number;
    until?: number;
    limit?: number;
    [key: TagName]: string[];
  }

  export namespace OutgoingMessage {
    export type Any = REQ | CLOSE | EVENT | AUTH;
    export type REQ = [type: "REQ", subId: string, ...filters: Filter[]];
    export type CLOSE = [type: "CLOSE", subId: string];
    export type EVENT = [type: "EVENT", event: Event];
    export type AUTH = [type: "AUTH", event: Event<Kind.Auth>];
  }

  export namespace IncomingMessage {
    export type Any = EVENT | EOSE | OK | AUTH;
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
}
