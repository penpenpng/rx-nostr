import { expect, test } from "vitest";

import {
  RxNostrError,
  RxNostrAlreadyDisposedError,
  RxNostrCallbackError,
  RxNostrEnvironmentError,
  RxNostrInvalidUsageError,
  RxNostrLogicError,
  RxNostrNip11Error,
  RxNostrPublicationError,
  RxNostrRelayDirectorySnapshotError,
} from "./error.ts";

const cause = new Error("original failure");

test.each([
  new RxNostrAlreadyDisposedError({ cause }),
  new RxNostrCallbackError("signer", cause),
  new RxNostrEnvironmentError("missing provider", { cause }),
  new RxNostrInvalidUsageError("invalid operation", { cause }),
  new RxNostrLogicError({ cause }),
  new RxNostrNip11Error("network", "network failed", undefined, { cause }),
  new RxNostrPublicationError("all-failed", [], { cause }),
  new RxNostrRelayDirectorySnapshotError("invalid-json", "invalid JSON", { cause }),
])("preserves Error conventions for $name", (error) => {
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(RxNostrError);
  expect(error.name).toBe(error.constructor.name);
  expect(error.cause).toBe(cause);
  expect(error.message).not.toContain(`${error.name}:`);
  expect(error.toString()).toBe(`${error.name}: ${error.message}`);
  expect(error.stack).toContain(error.toString());
});
