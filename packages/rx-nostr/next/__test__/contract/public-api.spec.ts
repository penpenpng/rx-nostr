import { describe, expect, test } from "vitest";
import * as publicApi from "rx-nostr";

describe("public entry point", () => {
  test("can be imported by contract tests", () => {
    expect(publicApi).toBeTypeOf("object");
  });
});
