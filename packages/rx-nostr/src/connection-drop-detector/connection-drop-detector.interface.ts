import type * as Nostr from "nostr-typedef";
import type { RelayUrl } from "../libs/relay-urls.ts";

export type ConnectionDropDetectorDisposer = () => void | PromiseLike<void>;

export interface ConnectionDropDetector {
  /** A diagnostic name unique among the detectors installed on one client. */
  readonly name?: string;
  /** Starts monitoring one ready relay connection. */
  setup(
    context: ConnectionDropDetectorContext,
  ): void | ConnectionDropDetectorDisposer | PromiseLike<void | ConnectionDropDetectorDisposer>;
}

export interface ConnectionDropDetectorContext {
  /** The normalized relay URL owned by this connection. */
  readonly relay: RelayUrl;
  /** Identifies this detector among those installed on the connection. */
  readonly detector: Readonly<{
    registrationIndex: number;
    name?: string;
  }>;
  /** Aborted when this physical connection ends. */
  readonly signal: AbortSignal;
  /** Registers cleanup owned by this physical connection. */
  defer(disposer: ConnectionDropDetectorDisposer, options?: Readonly<{ name?: string }>): void;
  /** Reports the current connection as dropped. */
  drop(): void;
  /** Sends a Nostr message and waits for the first matching relay response. */
  request(params: ConnectionDropDetectorRequest): Promise<Nostr.ToClientMessage.Any>;
  /** Isolates synchronous throws and asynchronous rejections from a host callback. */
  guard<TArgs extends readonly unknown[]>(
    callback: (...args: TArgs) => void | PromiseLike<void>,
  ): (...args: TArgs) => void;
  /** Starts a supervised background task owned by this connection. */
  run(task: (signal: AbortSignal) => void | PromiseLike<void>): void;
}

export interface ConnectionDropDetectorRequest {
  query: Nostr.ToRelayMessage.Any | (() => Nostr.ToRelayMessage.Any);
  selector: (message: Nostr.ToClientMessage.Any) => boolean;
  timeout?: number;
  signal?: AbortSignal;
}
