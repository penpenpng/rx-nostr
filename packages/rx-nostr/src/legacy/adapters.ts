import type { Authenticator, AuthenticatorInput } from "../authenticator/index.ts";
import type { ConnectionStatePacket } from "../index.ts";
import type { LegacyConnectionState } from "./types.ts";

export function withLegacyAuthTimeout(
  input: AuthenticatorInput,
  authTimeout: number,
): AuthenticatorInput {
  const withTimeout = (authenticator: Authenticator): Authenticator => ({
    ...authenticator,
    authTimeout: authenticator.authTimeout ?? authTimeout,
  });

  if (typeof input !== "function") return withTimeout(input);
  return (relay) => {
    const authenticator = input(relay);
    return authenticator ? withTimeout(authenticator) : undefined;
  };
}

export function toLegacyConnectionState(
  state: ConnectionStatePacket["state"],
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
