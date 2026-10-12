import type { Nip42Authenticator, Nip42AuthenticatorInput } from "../authenticator/index.ts";
import type { RelayConnectionStatePacket } from "../index.ts";
import type { LegacyConnectionState } from "./types.ts";

export function withLegacyAuthTimeout(
  input: Nip42AuthenticatorInput,
  authTimeout: number,
): Nip42AuthenticatorInput {
  const withTimeout = (authenticator: Nip42Authenticator): Nip42Authenticator => ({
    authTimeout: authenticator.authTimeout ?? authTimeout,
    challenge: (relay, challenge) => authenticator.challenge(relay, challenge),
  });

  if (typeof input !== "function") {
    return withTimeout(input);
  }

  return (relay) => {
    const authenticator = input(relay);

    return authenticator ? withTimeout(authenticator) : undefined;
  };
}

export function toLegacyConnectionState(
  state: RelayConnectionStatePacket["state"],
): LegacyConnectionState {
  switch (state.state) {
    case "dormant":
      return "dormant";
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "waiting-for-connection":
      return "waiting-for-retrying";
    case "retrying":
      return "retrying";
    case "failed":
      return state.reason.code === 4000 ? "rejected" : "error";
    case "disposed":
      return "terminated";
  }
}
