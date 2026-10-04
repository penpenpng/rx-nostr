import type { RelayUrl } from "../libs/relay-urls.ts";

/** A structured, synchronous log emitted by rx-nostr or its relay clients. */
export interface RxNostrDiagnostic {
  readonly level: "debug" | "info" | "warning" | "error";
  readonly event: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown> & { relay?: RelayUrl }>;
  readonly cause?: unknown;
}

export type RxNostrDiagnosticSink = (log: RxNostrDiagnostic) => void;

let diagnosticSink: RxNostrDiagnosticSink | undefined;

export function getDiagnosticSink(): RxNostrDiagnosticSink | undefined {
  return diagnosticSink;
}

export function setDiagnosticSink(sink: RxNostrDiagnosticSink | undefined): void {
  diagnosticSink = sink;
}

export function emitDiagnostic(diagnostic: Readonly<RxNostrDiagnostic>): void {
  const sink = diagnosticSink;
  if (!sink) return;
  try {
    sink(copyDiagnostic(diagnostic));
  } catch {
    // A logging callback must not change rx-nostr operation behavior.
  }
}

function copyDiagnostic(diagnostic: Readonly<RxNostrDiagnostic>): RxNostrDiagnostic {
  return Object.freeze({
    ...diagnostic,
    ...(diagnostic.context === undefined
      ? {}
      : { context: Object.freeze({ ...diagnostic.context }) }),
  });
}
