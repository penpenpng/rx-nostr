import * as Nostr from "nostr-typedef";

import type {
  VerificationRequest,
  VerificationResponse,
  VerificationServiceStatus,
} from "./types.js";
import { Batch } from "./uitls/batch.js";
import { type EventVerifier, verifier as defaultVerifier } from "./verifier.js";

type PingMessage = "ping";
type PongMessage = "pong";

export interface SignerOptions {
  tags?: Nostr.Tag.Any[];
}

export interface VerificationServiceClientConfig extends SignerOptions {
  worker: Worker;
  fallback?: EventVerifier;
  timeout?: number;
}

export interface VerificationServiceClient {
  start(): void;
  verifier: EventVerifier;
  get status(): VerificationServiceStatus;
  dispose(): void;
  [Symbol.dispose](): void;
}

/**
 * On the Worker context, it performs the verification process
 * in response to a request from VerificationServiceClient and returns the results to the client.
 */
export const startVerificationServiceHost = (
  verifier: EventVerifier = defaultVerifier,
) => {
  if (
    typeof WorkerGlobalScope === "undefined" ||
    !(self instanceof WorkerGlobalScope)
  ) {
    throw new Error(
      "startVerificationServiceHost() must be called in a Worker context.",
    );
  }

  self.addEventListener(
    "message",
    async (ev: MessageEvent<VerificationRequest | PingMessage>) => {
      if (ev.data === "ping") {
        self.postMessage("pong" satisfies PongMessage);
        return;
      }

      const { reqId, event } = ev.data;

      try {
        const ok = await verifier(event);

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
    },
  );
};

/**
 * This client does nothing, but can be used when you have to create a fake client
 * in a context where Worker does not exist, e.g. SSR
 */
export const createNoopClient = (): VerificationServiceClient => {
  const noop = () => {};
  return {
    start: noop,
    verifier: async () => false,
    get status() {
      return "prepared" as const;
    },
    dispose: noop,
    [Symbol.dispose]: noop,
  };
};

/**
 * Create a client that sends a verification request to the Worker and receive the result.
 * Since this does the verification process outside of the UI thread, it prevents the UI thread from hanging.
 * However, for example, if the Worker is not ready, the verification process is done by `fallback`, which runs on the UI thread.
 */
export const createVerificationServiceClient = ({
  worker,
  fallback,
  tags,
  timeout,
}: VerificationServiceClientConfig): VerificationServiceClient => {
  let status: VerificationServiceStatus = "prepared";
  let nextReqId = 1;

  const resolvers = new Map<number, (ok: boolean) => void>();
  const batch = new Batch(timeout ?? 10000);

  const fallbackVerifier: EventVerifier = fallback ?? defaultVerifier;
  const workerVerifier: EventVerifier = (event) => {
    const reqId = nextReqId++;

    const r = new Promise<boolean>((resolve, reject) => {
      resolvers.set(reqId, resolve);
      batch.set(() => {
        if (resolvers.get(reqId)) {
          reject(new Error("Verification request was timed out."));
          resolvers.delete(reqId);
        }
      });
    });

    worker?.postMessage({
      reqId,
      event,
    } satisfies VerificationRequest);

    return r;
  };

  const onmessage = (ev: MessageEvent<VerificationResponse | PongMessage>) => {
    if (status === "terminated") {
      return;
    }

    if (ev.data === "pong") {
      status = "active";
      return;
    }

    const { reqId, ok } = ev.data;

    resolvers.get(reqId)?.(ok);
    resolvers.delete(reqId);
  };

  const onerror = () => {
    if (status === "terminated") {
      return;
    }

    status = "error";
  };

  const start = () => {
    if (status === "prepared") {
      status = "booting";
      worker.addEventListener("message", onmessage);
      worker.addEventListener("error", onerror);
      worker.addEventListener("messageerror", onerror);
      worker.postMessage("ping" as PingMessage);
    }
  };

  const verifier: EventVerifier = (event) => {
    event = {
      ...event,
      tags: [...(event.tags ?? []), ...(tags ?? [])],
    };

    switch (status) {
      case "prepared":
        throw new Error("VerificationServiceClient is not started yet.");
      case "booting":
      case "error":
        return fallbackVerifier(event);
      case "active":
        return workerVerifier(event);
      case "terminated":
        throw new Error("VerificationServiceClient is already disposed.");
    }
  };

  const dispose = () => {
    if (status === "terminated") {
      return;
    }

    status = "terminated";
    worker.removeEventListener("message", onmessage);
    worker.removeEventListener("error", onerror);
    worker.removeEventListener("messageerror", onerror);
    worker.terminate();
    batch.stop();
  };

  return {
    start,
    verifier,
    get status() {
      return status;
    },
    dispose,
    [Symbol.dispose]: dispose,
  };
};
