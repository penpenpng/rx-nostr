import type * as Nostr from "nostr-typedef";
import { once } from "../libs/once.ts";
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

export class VerificationClient implements EventVerifier {
  #status: VerificationServiceStatus = "prepared";
  #nextReqId = 1;
  #resolvers = new Map<number, (ok: boolean) => void>();
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

    this.#resolvers.get(reqId)?.(ok);
    this.#resolvers.delete(reqId);
  };

  #onerror = () => {
    if (this.#status === "terminated") {
      return;
    }

    this.#status = "error";
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

    const r = new Promise<boolean>((resolve, reject) => {
      this.#resolvers.set(reqId, resolve);
      this.#batch.set(() => {
        if (this.#resolvers.get(reqId)) {
          reject(new Error("Verification request was timed out."));
          this.#resolvers.delete(reqId);
        }
      });
    });

    const worker = this.config.worker;
    worker.postMessage({
      reqId,
      event,
    } satisfies VerificationRequest);

    return r;
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
  private fireNext: Callback[] = [];
  private takeNext: Callback[] = [];

  constructor(interval: number) {
    this.timer = setInterval(() => {
      for (const f of this.fireNext) {
        f();
      }
      this.fireNext = this.takeNext;
      this.takeNext = [];
    }, interval);
  }

  set(f: Callback) {
    this.takeNext.push(f);
  }

  stop() {
    clearInterval(this.timer);
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
