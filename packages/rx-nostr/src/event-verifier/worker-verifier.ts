// Worker.postMessage has no targetOrigin parameter; that argument only applies to Window.
/* eslint-disable unicorn/require-post-message-target-origin */
import type * as Nostr from "nostr-typedef";

import { once } from "../libs/index.ts";
import type { EventVerifier } from "./event-verifier.interface.ts";

export class VerificationHost {
  constructor(private verifier: EventVerifier) {}

  start() {
    if (typeof WorkerGlobalScope === "undefined" || !(self instanceof WorkerGlobalScope)) {
      throw new Error(".start() must be called in a Worker context.");
    }

    self.addEventListener("message", this.#handler);
  }

  #handler = async (ev: MessageEvent<VerificationRequest | PingMessage>) => {
    if (ev.data === "ping") {
      self.postMessage("pong" satisfies PongMessage);

      return;
    }

    const { reqId, event } = ev.data;

    try {
      const ok = await this.verifier.verifyEvent(event);

      self.postMessage({
        reqId,
        ok,
      } satisfies VerificationResponse);
    } catch (err) {
      self.postMessage({
        reqId,
        ok: false,
        error: `${err}`,
      } satisfies VerificationResponse);
    }
  };

  [Symbol.dispose] = once(() => {
    if (typeof WorkerGlobalScope === "undefined" || !(self instanceof WorkerGlobalScope)) {
      throw new Error(".stop() must be called in a Worker context.");
    }

    self.removeEventListener("message", this.#handler);
  });
  dispose = this[Symbol.dispose];
}

/** Worker-backed verifier; pending requests reject when it fails or is disposed. */
export class VerificationClient implements EventVerifier {
  #status: VerificationServiceStatus = "prepared";
  #nextReqId = 1;
  #pending = new Map<
    number,
    { resolve: (ok: boolean) => void; reject: (error: unknown) => void; cancelTimeout: () => void }
  >();
  #batch: Batch;

  constructor(private config: VerificationClientConfig) {
    this.#batch = new Batch(config.timeout ?? 10000);
  }

  get status() {
    return this.#status;
  }

  start() {
    if (this.#status === "prepared") {
      this.#status = "booting";

      const worker = this.config.worker;

      worker.addEventListener("message", this.#onmessage);
      worker.addEventListener("error", this.#onerror);
      worker.addEventListener("messageerror", this.#onerror);
      worker.postMessage("ping" as PingMessage);
    }
  }

  #onmessage = (ev: MessageEvent<VerificationResponse | PongMessage>) => {
    if (this.#status === "terminated") {
      return;
    }

    if (ev.data === "pong") {
      this.#status = "active";

      return;
    }

    const { reqId, ok } = ev.data;

    this.#settle(reqId, { ok });
  };

  #onerror = () => {
    if (this.#status === "terminated") {
      return;
    }

    this.#status = "error";

    this.#rejectPending(new Error("Verification worker failed."));
  };

  verifyEvent(event: Nostr.Event): Promise<boolean> {
    switch (this.#status) {
      case "prepared":
        throw new Error("VerificationClient is not started yet.");
      case "booting":
      case "error":
        return this.#verifyByFallback(event);
      case "active":
        return this.#verifyByWorker(event);
      case "terminated":
        throw new Error("VerificationClient is already disposed.");
    }
  }

  #verifyByWorker(event: Nostr.Event): Promise<boolean> {
    const reqId = this.#nextReqId++;

    const result = new Promise<boolean>((resolve, reject) => {
      const cancelTimeout = this.#batch.set(() => {
        this.#settle(reqId, { error: new Error("Verification request was timed out.") });
      });

      this.#pending.set(reqId, { resolve, reject, cancelTimeout });
    });

    try {
      this.config.worker.postMessage({ reqId, event } satisfies VerificationRequest);
    } catch (error) {
      this.#settle(reqId, { error });
      this.#onerror();
    }

    return result;
  }

  #settle(reqId: number, result: { ok: boolean } | { error: unknown }): void {
    const pending = this.#pending.get(reqId);

    if (!pending) {
      return;
    }

    this.#pending.delete(reqId);
    pending.cancelTimeout();

    if ("error" in result) {
      pending.reject(result.error);
    } else {
      pending.resolve(result.ok);
    }
  }

  #rejectPending(error: unknown): void {
    for (const reqId of this.#pending.keys()) {
      this.#settle(reqId, { error });
    }
  }

  #verifyByFallback(event: Nostr.Event): Promise<boolean> {
    const verifier = this.config.fallback;

    if (!verifier) {
      throw new Error("VerificationHost is not working but no fallback verifier is provided.");
    }

    return verifier.verifyEvent(event);
  }

  [Symbol.dispose] = once(() => {
    this.#status = "terminated";

    this.#rejectPending(new Error("VerificationClient was disposed."));

    const worker = this.config.worker;

    worker.removeEventListener("message", this.#onmessage);
    worker.removeEventListener("error", this.#onerror);
    worker.removeEventListener("messageerror", this.#onerror);
    worker.terminate();

    this.#batch.stop();
  });
  dispose = this[Symbol.dispose];
}

type Callback = () => void;

class Batch {
  private timer: ReturnType<typeof setInterval>;
  private fireNext = new Set<Callback>();
  private takeNext = new Set<Callback>();

  constructor(interval: number) {
    this.timer = setInterval(() => {
      for (const f of this.fireNext) {
        f();
      }

      this.fireNext = this.takeNext;
      this.takeNext = new Set();
    }, interval);
  }

  set(f: Callback): () => void {
    this.takeNext.add(f);

    return () => {
      this.fireNext.delete(f);
      this.takeNext.delete(f);
    };
  }

  stop() {
    clearInterval(this.timer);
    this.fireNext.clear();
    this.takeNext.clear();
  }
}

type PingMessage = "ping";
type PongMessage = "pong";

export interface VerificationRequest {
  reqId: number;
  event: Nostr.Event;
}

export interface VerificationResponse {
  reqId: number;
  ok: boolean;
  error?: string;
}

export type VerificationServiceStatus = "prepared" | "booting" | "active" | "error" | "terminated";

export interface VerificationClientConfig {
  worker: Worker;
  fallback?: EventVerifier;
  timeout?: number;
}
// Worker.postMessage has no targetOrigin parameter; that argument only applies to Window.
// oxlint-disable unicorn(require-post-message-target-origin)
