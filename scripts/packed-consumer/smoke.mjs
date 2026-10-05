import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SimpleVerifier as JsVerifier } from "@rx-nostr/crypto";
import { SimpleVerifier as WasmVerifier } from "@rx-nostr/crypto-wasm";
import { RxNostr, RxRelays, RxReq } from "rx-nostr";
import { createLegacyRxNostr } from "rx-nostr/legacy";
import { latestEach } from "rx-nostr/operators";
import { ensureEventFields, now } from "rx-nostr/utils";

const signedEvent = JSON.parse(
  readFileSync(new URL("./signed-event.json", import.meta.url), "utf8"),
);

assert.equal(typeof latestEach, "function");
assert.equal(typeof createLegacyRxNostr, "function");
assert.equal(typeof now(), "number");
assert.equal(ensureEventFields(signedEvent), true);
assert.equal(await new JsVerifier().verifyEvent(signedEvent), true);
assert.equal(await new WasmVerifier().verifyEvent(signedEvent), true);

const client = new RxNostr({ verifier: new JsVerifier() });
const request = new RxReq();
const relays = new RxRelays(["wss://relay.example.com"]);

assert.deepEqual([...relays], ["wss://relay.example.com"]);
request.dispose();
relays.dispose();
client.dispose();

console.log("Packed ESM entries and WASM verifier: OK");
