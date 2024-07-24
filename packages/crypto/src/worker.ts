import * as Nostr from "nostr-typedef";

import { VerificationRequest, VerificationResponse } from "./types.js";
import { Batch } from "./uitls/batch.js";
import { type EventVerifier, verifier as defaultVerifier } from "./verifier.js";

type PingMessage = "ping";
type PongMessage = "pong";
type VerificationServiceState =
  | "prepared"
  | "booting"
  | "active"
  | "error"
  | "terminated";

export interface SignerOptions {
  tags?: Nostr.Tag.Any[];
}

export interface VerificationServiceClientConfig extends SignerOptions {
  worker: Worker;
  fallback?: EventVerifier;
}

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

export const createVerificationServiceClient = ({
  worker,
  fallback,
  tags,
}: VerificationServiceClientConfig) => {
  let status: VerificationServiceState = "prepared";
  let nextReqId = 1;

  const resolvers = new Map<number, (ok: boolean) => void>();
  const batch = new Batch(5000);

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
    [Symbol.dispose]: dispose,
    start,
    dispose,
    verifier,
    get status() {
      return status;
    },
  };
};
