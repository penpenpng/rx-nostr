import { finalize, Observable, Subject, TimeoutError, type Subscription } from "rxjs";
import type {
  EventPacket,
  EventSigner,
  EventVerifier,
  OkPacket,
  PublishEventParameters,
  RxNostrConfig,
  RxNostrReqConfig,
  RxReq,
} from "./index.ts";
import { ExponentialBackoffReconnector, NoopReconnector } from "./connection-reconnector/index.ts";
import type { ConnectionReconnector } from "./connection-reconnector/index.ts";
import { NoopVerifier } from "./event-verifier/index.ts";
import type { Authenticator, AuthenticatorInput } from "./authenticator/index.ts";
import { RxNostr } from "./rx-nostr/index.ts";
import { RxRelays } from "./rx-relays/index.ts";
import type { RelayInput } from "./types/index.ts";

/** v3-style relay entry, including the permissions supported by v3. */
export type LegacyRelay = string | { url: string; read?: boolean; write?: boolean };
export type LegacyRelayInput =
  | Iterable<LegacyRelay>
  | LegacyRelay
  | RxRelays
  | Record<string, { read?: boolean; write?: boolean }>;

export type LegacyConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "waiting-for-retrying"
  | "retrying"
  | "dormant"
  | "error"
  | "rejected"
  | "terminated";

export interface LegacyConnectionStatePacket {
  from: string;
  state: LegacyConnectionState;
}

export interface LegacyRelayStatus {
  connection: LegacyConnectionState;
}

export interface LegacyRetryConfig {
  strategy: "exponential" | "linear" | "immediately" | "off";
  maxCount?: number;
  initialDelay?: number;
  interval?: number;
  polite?: boolean;
}

export interface LegacyRxNostrConfig extends Omit<RxNostrConfig, "verifier" | "reconnector"> {
  verifier?: EventVerifier | ((event: import("nostr-typedef").Event) => Promise<boolean>);
  signer?: EventSigner;
  connectionStrategy?: "lazy" | "lazy-keep" | "aggressive";
  retry?: LegacyRetryConfig;
  disconnectTimeout?: number;
  eoseTimeout?: number;
  okTimeout?: number;
  authTimeout?: number;
  skipVerify?: boolean;
  skipValidateFilterMatching?: boolean;
  skipExpirationCheck?: boolean;
  websocketCtor?: RxNostrConfig["WebSocket"];
  reconnector?: ConnectionReconnector;
}

export interface ILegacyRxNostr {
  readonly defaultRelays: RxRelays;
  getDefaultRelays(options?: { filter?: "read-only" | "write-only" | "read-all" | "write-all" | "all" }): Record<string, { url: string; read: boolean; write: boolean }>;
  getDefaultRelay(url: string): { url: string; read: boolean; write: boolean } | undefined;
  getAllRelayStatus(): Record<string, LegacyRelayStatus>;
  getRelayStatus(url: string): LegacyRelayStatus | undefined;
  setDefaultRelays(relays: LegacyRelayInput): void;
  addDefaultRelays(relays: LegacyRelayInput): void;
  removeDefaultRelays(urls: string | string[]): void;
  setAdditionalRelays(relays: LegacyRelayInput): void;
  use(request: RxReq, options?: LegacyUseOptions): Observable<EventPacket>;
  send(event: PublishEventParameters, options?: LegacySendOptions): Observable<LegacyOkPacket>;
  cast(event: PublishEventParameters, options?: Omit<LegacySendOptions, "completeOn">): Promise<void>;
  createConnectionStateObservable(): Observable<LegacyConnectionStatePacket>;
  dispose(): void;
  [Symbol.dispose](): void;
}

export interface LegacyUseOptions extends RxNostrReqConfig {
  /** @deprecated Use `on.relays` instead. */
  relays?: string[];
  on?: { relays?: RelayInput; defaultReadRelays?: boolean };
}
export interface LegacySendOptions {
  signer?: EventSigner;
  /** @deprecated Use `on.relays` instead. */
  relays?: string[];
  on?: { relays?: RelayInput; defaultWriteRelays?: boolean };
  errorOnTimeout?: boolean;
  completeOn?: "all-ok" | "any-ok" | "sent";
  timeout?: number;
}

export type LegacyOkPacket = OkPacket & { done: boolean };

/** Create a v3-shaped facade backed by the v4 RxNostr implementation. */
export function createLegacyRxNostr(config: LegacyRxNostrConfig = {}): ILegacyRxNostr {
  const {
    verifier,
    skipVerify,
    skipValidateFilterMatching,
    skipExpirationCheck,
    eoseTimeout,
    okTimeout,
    disconnectTimeout,
    websocketCtor,
    authTimeout,
    connectionStrategy,
    retry,
    reconnector,
    defaultOptions,
    ...v4Config
  } = config;
  const adaptedVerifier: EventVerifier | undefined =
    typeof verifier === "function" ? { verifyEvent: verifier } : verifier;
  const client = new RxNostr({
    ...v4Config,
    ...(skipVerify
      ? { verifier: new NoopVerifier() }
      : adaptedVerifier
        ? { verifier: adaptedVerifier }
        : {}),
    ...(authTimeout === undefined ||
    v4Config.authenticator === undefined ||
    v4Config.authenticator === false
      ? {}
      : { authenticator: withLegacyAuthTimeout(v4Config.authenticator, authTimeout) }),
    ...(reconnector
      ? { reconnector }
      : retry
        ? { reconnector: legacyRetryReconnector(retry) }
        : {}),
    ...(websocketCtor && !v4Config.WebSocket ? { WebSocket: websocketCtor } : {}),
    defaultOptions: {
      ...defaultOptions,
      req: {
        ...defaultOptions?.req,
        ...(eoseTimeout === undefined ? {} : { timeout: eoseTimeout }),
        ...(disconnectTimeout === undefined ? {} : { linger: disconnectTimeout }),
        ...(skipValidateFilterMatching === undefined ? {} : { skipValidateFilterMatching }),
        ...(skipExpirationCheck === undefined ? {} : { skipExpirationCheck }),
      },
      publish: {
        ...defaultOptions?.publish,
        ...(okTimeout === undefined ? {} : { timeout: okTimeout }),
        ...(disconnectTimeout === undefined ? {} : { linger: disconnectTimeout }),
      },
    },
  });
  const defaultRelays = new RxRelays();
  const readable = new RxRelays();
  const writable = new RxRelays();
  const additional = new RxRelays();
  const relayStates = new Map<string, LegacyConnectionState>();
  const connectionStates = new Subject<LegacyConnectionStatePacket>();
  const connectionStateSubscription = client.monitorConnectionState().subscribe(({ from, state }) => {
    const packet = { from, state: toLegacyConnectionState(state) };
    relayStates.set(from, packet.state);
    connectionStates.next(packet);
  });

  const entriesOf = (input: LegacyRelayInput): LegacyRelay[] => {
    if (input instanceof RxRelays) return [...input];
    if (typeof input === "string") return [input];
    if (Array.isArray(input)) return [...input];
    if ("url" in input) return [input as LegacyRelay];
    return Object.entries(input).map(([url, permissions]) => ({ url, ...permissions }));
  };
  const set = (input: LegacyRelayInput, all: RxRelays, read: RxRelays, write: RxRelays) => {
    const entries = entriesOf(input);
    const urls = entries.map((entry) => (typeof entry === "string" ? entry : entry.url));
    all.set(...urls);
    read.set(
      ...entries
        .filter((entry) => typeof entry === "string" || entry.read !== false)
        .map((entry) => (typeof entry === "string" ? entry : entry.url)),
    );
    write.set(
      ...entries
        .filter((entry) => typeof entry === "string" || entry.write !== false)
        .map((entry) => (typeof entry === "string" ? entry : entry.url)),
    );
  };
  const combine = (a: RxRelays, b: RxRelays) => RxRelays.union(a, b);

  return {
    defaultRelays,
    getDefaultRelays(options) {
      const urls = new Set(defaultRelays);
      const result: Record<string, { url: string; read: boolean; write: boolean }> = {};
      for (const url of urls) {
        const read = readable.has(url);
        const write = writable.has(url);
        const filter = options?.filter;
        if (
          filter === "read-only" ? !(read && !write) :
          filter === "write-only" ? !(!read && write) :
          filter === "read-all" ? !read :
          filter === "write-all" ? !write : false
        ) continue;
        result[url] = { url, read, write };
      }
      return result;
    },
    getDefaultRelay(url) {
      const relays = this.getDefaultRelays();
      const normalizedUrl = RxRelays.array([url])[0];
      return normalizedUrl ? relays[normalizedUrl] : undefined;
    },
    getAllRelayStatus() {
      return Object.fromEntries(
        [...relayStates].map(([url, connection]) => [url, { connection }]),
      );
    },
    getRelayStatus(url) {
      const normalizedUrl = RxRelays.array([url])[0];
      const connection = normalizedUrl ? relayStates.get(normalizedUrl) : undefined;
      return connection === undefined ? undefined : { connection };
    },
    setDefaultRelays(relays) {
      set(relays, defaultRelays, readable, writable);
      for (const url of defaultRelays) relayStates.set(url, relayStates.get(url) ?? "initialized");
      if (connectionStrategy === "aggressive") client.setHotRelays(defaultRelays);
    },
    addDefaultRelays(relays) {
      const current = this.getDefaultRelays();
      for (const entry of entriesOf(relays)) {
        const url = typeof entry === "string" ? entry : entry.url;
        const normalized = new RxRelays([url]);
        const key = [...normalized][0] ?? url;
        normalized.dispose();
        const read = typeof entry === "string" ? true : entry.read ?? true;
        const write = typeof entry === "string" ? true : entry.write ?? true;
        current[key] = { url: key, read, write };
      }
      this.setDefaultRelays(Object.values(current));
    },
    removeDefaultRelays(urls) {
      const remove = new Set<string>(RxRelays.array(Array.isArray(urls) ? urls : [urls]));
      const current = Object.values(this.getDefaultRelays()).filter((relay) => !remove.has(relay.url));
      this.setDefaultRelays(current);
    },
    setAdditionalRelays(relays) {
      set(relays, additional, additional, additional);
    },
    use(request, options = {}) {
      const base =
        options.on?.defaultReadRelays === false ? new RxRelays() : combine(readable, additional);
      const explicitRelays = options.on?.relays ?? options.relays;
      const relays = explicitRelays ? combine(base, RxRelays.from(explicitRelays)) : base;
      return client.forward(relays, request, options).pipe(
        finalize(() => {
          base.dispose();
          if (relays !== base) relays.dispose();
        }),
      );
    },
    send(event, options = {}) {
      const base =
        options.on?.defaultWriteRelays === false ? new RxRelays() : combine(writable, additional);
      const explicitRelays = options.on?.relays ?? options.relays;
      const relays = explicitRelays ? combine(base, RxRelays.from(explicitRelays)) : base;
      const publication = client.publish(
        relays,
        event,
        {
          ...(options.signer ? { signer: options.signer } : {}),
          ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
        },
      );
      const packets = new Subject<LegacyOkPacket>();
      let finished = false;
      let okSubscription: Subscription | undefined;
      const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        okSubscription?.unsubscribe();
        if (error !== undefined) packets.error(error);
        else packets.complete();
        publication.cancel();
        base.dispose();
        if (relays !== base) relays.dispose();
      };
      const completeOn = options.completeOn ?? "all-ok";
      okSubscription = publication.subscribe({
        next(packet) {
          packets.next({ ...packet, done: true });
          if (completeOn === "any-ok" && packet.ok) finish();
        },
        error: (error) => finish(error),
        complete() {
          if (options.errorOnTimeout) {
            void publication.waitFor("all").then(
              () => finish(),
              (error: unknown) => {
                const failures =
                  error instanceof Error && "failures" in error
                    ? (error as { failures?: Array<{ kind?: string }> }).failures
                    : undefined;
                finish(failures?.some(({ kind }) => kind === "timeout") ? new TimeoutError() : undefined);
              },
            );
          } else finish();
        },
      });
      if (completeOn === "sent") {
        void publication.event.then(() => finish(), (error) => finish(error));
      } else {
        // Keep a rejection handler attached even when no consumer subscribes.
        void publication.event.catch(() => {});
      }
      return packets.asObservable();
    },
    cast(event, options = {}) {
      return new Promise<void>((resolve, reject) => {
        this.send(event, { ...options, completeOn: "sent" }).subscribe({
          error: reject,
          complete: resolve,
        });
      });
    },
    createConnectionStateObservable: () => connectionStates.asObservable(),
    dispose() {
      for (const [from, state] of relayStates) {
        if (state === "terminated") continue;
        relayStates.set(from, "terminated");
        connectionStates.next({ from, state: "terminated" });
      }
      client.dispose();
      connectionStateSubscription.unsubscribe();
      connectionStates.complete();
      defaultRelays.dispose();
      readable.dispose();
      writable.dispose();
      additional.dispose();
    },
    [Symbol.dispose]() {
      this.dispose();
    },
  };
}

function legacyRetryReconnector(retry: LegacyRetryConfig): ConnectionReconnector {
  if (retry.strategy === "off") return new NoopReconnector();
  if (retry.strategy === "exponential") {
    const backoff = new ExponentialBackoffReconnector({
      maxRetries: retry.maxCount,
      initialDelay: retry.initialDelay,
    });
    return {
      reconnect(context) {
        if (retry.polite && context.phase === "initial" && context.health.lastConnectedAt === undefined) {
          return { action: "cancel" };
        }
        return backoff.reconnect(context);
      },
    };
  }
  return {
    reconnect(context) {
      const { attempt } = context;
      if (retry.polite && context.phase === "initial" && context.health.lastConnectedAt === undefined) {
        return { action: "cancel" };
      }
      if (attempt > (retry.maxCount ?? 5)) return { action: "exhaust" };
      return {
        action: "retry",
        delay: retry.strategy === "immediately" ? 0 : (retry.interval ?? 1_000),
      };
    },
  };
}

function withLegacyAuthTimeout(
  input: AuthenticatorInput,
  authTimeout: number,
): AuthenticatorInput {
  const withTimeout = (authenticator: Authenticator): Authenticator => ({
    ...authenticator,
    authTimeout: authenticator.authTimeout ?? authTimeout,
  });
  if (typeof input !== "function") return withTimeout(input);
  return (relay) => {
    const authenticator = input(relay);
    return authenticator ? withTimeout(authenticator) : undefined;
  };
}

function toLegacyConnectionState(
  state: import("./index.ts").ConnectionStatePacket["state"],
): LegacyConnectionState {
  switch (state.state) {
    case "dormant":
      return "dormant";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "waiting-for-retry":
      return "waiting-for-retrying";
    case "retrying":
      return "retrying";
    case "failed":
      return state.reason.code === 4000 ? "rejected" : "error";
    case "disposed":
      return "terminated";
  }
}
