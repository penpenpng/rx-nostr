import { map, Subject, type Observable } from "rxjs";
import type { RelayUrl } from "../libs/relay-urls.ts";

/**
 * Non-actionable supplemental information useful when debugging rx-nostr.
 *
 * Diagnostics are not operation results or exceptions. Applications should
 * normally record them rather than branch application behavior on them.
 */
export interface RxNostrDiagnostic {
  /**
   * The impact of the reported failure.
   *
   * `warning` means the condition was intentionally tolerated, ignored, or
   * left to retry/recovery, so the affected work can still follow its defined
   * control flow. `error` means an operation, callback, policy, or cleanup
   * task ended without completing its intended work because of an unexpected
   * failure. Neither value requires application-level handling, and this
   * classification does not prescribe a logging level.
   */
  severity: "warning" | "error";
  occurredAt: number;
  relay?: RelayUrl;
  /**
   * Human-readable explanation of the diagnostic.
   *
   * This text is not a stable identifier and must not be used to branch
   * application behavior.
   */
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

const subject = new Subject<RxNostrDiagnostic>();

/** Process-wide hot stream of diagnostics from every RxNostr instance. */
export const diagnostics: Observable<RxNostrDiagnostic> = subject.pipe(map(copyDiagnostic));

export function emitDiagnostic(diagnostic: Readonly<RxNostrDiagnostic>): void {
  subject.next(copyDiagnostic(diagnostic));
}

function copyDiagnostic(diagnostic: Readonly<RxNostrDiagnostic>): RxNostrDiagnostic {
  return {
    ...diagnostic,
    ...(diagnostic.details === undefined ? {} : { details: { ...diagnostic.details } }),
  };
}
