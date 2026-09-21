import type * as Nostr from "nostr-typedef";
import type { WebSocketData } from "unipls";
import { ensureEventFields } from "../../libs/nostr/event.ts";
import type { RelayUrl } from "../../libs/relay-urls.ts";
import type { MessagePacket } from "../../packets/index.ts";

export type NostrMessageDecodeErrorCode =
  | "binary-message"
  | "invalid-json"
  | "invalid-tuple";

export class NostrMessageDecodeError extends Error {
  override readonly name = "NostrMessageDecodeError";

  constructor(
    public readonly code: NostrMessageDecodeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function serializeNostrMessage(
  message: Nostr.ToRelayMessage.Any,
): string {
  return JSON.stringify(message);
}

export function decodeRelayMessage(
  data: WebSocketData,
  from: RelayUrl,
): MessagePacket {
  if (typeof data !== "string") {
    throw new NostrMessageDecodeError(
      "binary-message",
      "Nostr relay messages must be JSON text.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (cause) {
    throw new NostrMessageDecodeError(
      "invalid-json",
      "The relay message is not valid JSON.",
      { cause },
    );
  }

  if (!Array.isArray(value) || typeof value[0] !== "string") {
    return invalidTuple();
  }

  switch (value[0]) {
    case "EVENT": {
      if (
        value.length !== 3 ||
        typeof value[1] !== "string" ||
        !isEvent(value[2])
      ) {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.EVENT;
      return {
        from,
        type: "EVENT",
        message,
        subId: message[1],
        event: message[2],
      };
    }
    case "EOSE": {
      if (value.length !== 2 || typeof value[1] !== "string") {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.EOSE;
      return { from, type: "EOSE", message, subId: message[1] };
    }
    case "OK": {
      if (
        value.length !== 4 ||
        typeof value[1] !== "string" ||
        typeof value[2] !== "boolean" ||
        typeof value[3] !== "string"
      ) {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.OK;
      return {
        from,
        type: "OK",
        message,
        eventId: message[1],
        ok: message[2],
        notice: message[3],
        noticeType: readMachinePrefix(message[3]),
      };
    }
    case "CLOSED": {
      if (
        value.length !== 3 ||
        typeof value[1] !== "string" ||
        typeof value[2] !== "string"
      ) {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.CLOSED;
      return {
        from,
        type: "CLOSED",
        message,
        subId: message[1],
        notice: message[2],
        noticeType: readMachinePrefix(message[2]),
      };
    }
    case "NOTICE": {
      if (value.length !== 2 || typeof value[1] !== "string") {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.NOTICE;
      return { from, type: "NOTICE", message, notice: message[1] };
    }
    case "AUTH": {
      if (value.length !== 2 || typeof value[1] !== "string") {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.AUTH;
      return { from, type: "AUTH", message, challenge: message[1] };
    }
    case "COUNT": {
      if (
        value.length !== 3 ||
        typeof value[1] !== "string" ||
        !isCountResponse(value[2])
      ) {
        return invalidTuple();
      }
      const message = value as Nostr.ToClientMessage.COUNT;
      return {
        from,
        type: "COUNT",
        message,
        subId: message[1],
        count: message[2],
      };
    }
    default:
      return invalidTuple();
  }
}

function invalidTuple(): never {
  throw new NostrMessageDecodeError(
    "invalid-tuple",
    "The relay message is not a supported Nostr tuple.",
  );
}

function isEvent(value: unknown): value is Nostr.Event {
  return (
    typeof value === "object" &&
    value !== null &&
    ensureEventFields(value as Partial<Nostr.Event>)
  );
}

function isCountResponse(value: unknown): value is Nostr.CountResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { count?: unknown }).count === "number"
  );
}

const machinePrefixes = new Set<Nostr.MachineReadablePrefix>([
  "duplicate",
  "pow",
  "blocked",
  "rate-limited",
  "invalid",
  "error",
  "auth-required",
  "restricted",
]);

function readMachinePrefix(
  message: string,
): Nostr.MachineReadablePrefix | undefined {
  const prefix = message.slice(0, message.indexOf(":"));
  return machinePrefixes.has(prefix as Nostr.MachineReadablePrefix)
    ? (prefix as Nostr.MachineReadablePrefix)
    : undefined;
}
