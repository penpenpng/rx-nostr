export type RelayCommunicationErrorReason =
  | "aborted"
  | "timeout"
  | "open-error"
  | "dropped"
  | "buffer-overflow"
  | "callback-error"
  | "fatal-error";

export class RelayCommunicationError extends Error {
  override readonly name = "RelayCommunicationError";

  constructor(
    public readonly reason: RelayCommunicationErrorReason,
    options?: ErrorOptions,
  ) {
    super(`The relay operation ended with ${reason}.`, options);
  }
}
