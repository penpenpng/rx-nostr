import * as Nostr from "nostr-typedef";

import { Batch } from "./uitls/batch.js";
import { type EventVerifier, verifier as defaultVerifier } from "./verifier.js";

interface VerificationRequest {
  reqId: number;
  event: Nostr.Event;
}

interface VerificationResponse {
  reqId: number;
  ok: boolean;
}

export const startVerificationServiceHost = (
  verifier: EventVerifier = defaultVerifier,
) => {
  if (
    typeof ServiceWorkerGlobalScope === "undefined" ||
    !(self instanceof ServiceWorkerGlobalScope)
  ) {
    throw new Error(
      "startVerificationServiceHost() must be called in a Service Worker context.",
    );
  }

  self.addEventListener(
    "message",
    async (ev: MessageEvent<VerificationRequest>) => {
      const { reqId, event } = ev.data;

      ev.source?.postMessage({
        reqId,
        ok: await verifier(event),
      } satisfies VerificationResponse);
    },
  );

  self.addEventListener("activate", (ev) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ev as any).waitUntil((self as any).clients.claim());
  });
};

export const createVerificationServiceClient = () => {
  if (!navigator?.serviceWorker) {
    throw new Error("This runtime doesn't support Service Worker.");
  }

  let disposed = false;
  let nextReqId = 1;
  const resolvers = new Map<number, (ok: boolean) => void>();
  const batch = new Batch(5000);

  const listener = (ev: MessageEvent<VerificationResponse>) => {
    const { reqId, ok } = ev.data;

    resolvers.get(reqId)?.(ok);
    resolvers.delete(reqId);
  };

  navigator.serviceWorker.addEventListener("message", listener);

  const verify: EventVerifier = (event) => {
    if (disposed) {
      throw new Error("VerificationServiceClient is already disposed.");
    }

    const controller = navigator.serviceWorker.controller;

    if (controller) {
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

      controller.postMessage({
        reqId,
        event,
      } satisfies VerificationRequest);

      return r;
    } else {
      // fallback
      return defaultVerifier(event);
    }
  };

  const dispose = () => {
    disposed = true;
    navigator.serviceWorker.removeEventListener("message", listener);
    batch.stop();
  };

  return {
    [Symbol.dispose]: dispose,
    dispose,
    verify,
  };
};
