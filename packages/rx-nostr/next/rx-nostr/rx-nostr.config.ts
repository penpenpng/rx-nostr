import { SimpleAuthenticator } from "../authenticator/simple-authenticator.ts";
import { NoopRetryer } from "../connection-retryer/index.ts";
import { Nip07Signer } from "../event-signer/index.ts";
import type {
  RxNostrConfig,
  RxNostrEventOptions,
  RxNostrReqOptions,
} from "./rx-nostr.interface.ts";

export class FilledRxNostrConfig {
  constructor(private config: RxNostrConfig) {}

  get verifier() {
    const key = "verifier";
    return this.config[key];
  }
  get signer() {
    const key = "signer";
    return this.config[key] ?? new Nip07Signer();
  }
  get authenticator() {
    const key = "authenticator";
    return this.config[key] ?? new SimpleAuthenticator(this.signer);
  }
  get retry() {
    const key = "retry";
    return this.config[key] ?? new NoopRetryer();
  }
  get authTimeout() {
    const key = "authTimeout";
    return this.config[key] ?? 30 * 1000;
  }
  get skipFetchNip11() {
    const key = "skipFetchNip11";
    return this.config[key] ?? false;
  }
  get WebSocket() {
    const key = "WebSocket";
    return this.config[key] ?? globalThis.WebSocket;
  }
}

export class FilledRxNostrReqOptions {
  constructor(
    private config: RxNostrReqOptions,
    private rootConfig: RxNostrConfig,
  ) {}

  private get base() {
    return this.rootConfig.defaultOptions?.req ?? {};
  }

  get defer() {
    const key = "defer";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get linger() {
    const key = "linger";
    return this.config[key] ?? this.base[key] ?? Number.POSITIVE_INFINITY;
  }
  get weak() {
    const key = "weak";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get timeout() {
    const key = "timeout";
    return this.config[key] ?? this.base[key] ?? 30 * 1000;
  }
  get skipExpirationCheck() {
    const key = "skipExpirationCheck";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get skipValidateFilterMatching() {
    const key = "skipValidateFilterMatching";
    return this.config[key] ?? this.base[key] ?? false;
  }
}

export class FilledRxNostrEventOptions {
  constructor(
    private config: RxNostrEventOptions,
    private rootConfig: RxNostrConfig,
  ) {}

  private get base() {
    return this.rootConfig.defaultOptions?.event ?? {};
  }

  private get root() {
    return new FilledRxNostrConfig(this.rootConfig);
  }

  get signer() {
    const key = "signer";
    return this.config[key] ?? this.base[key] ?? this.root[key];
  }
  get weak() {
    const key = "weak";
    return this.config[key] ?? this.base[key] ?? false;
  }
  get timeout() {
    const key = "timeout";
    return this.config[key] ?? this.base[key] ?? 30 * 1000;
  }
}
