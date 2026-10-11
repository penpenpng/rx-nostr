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
const secondRelays = new RxRelays(["wss://other.example.com"]);
const union = RxRelays.union(relays, secondRelays);
const intersection = RxRelays.intersection(relays, secondRelays);
const difference = RxRelays.difference(union, secondRelays);

assert.deepEqual([...relays], ["wss://relay.example.com"]);
assert.deepEqual([...union], ["wss://relay.example.com", "wss://other.example.com"]);
assert.deepEqual([...intersection], []);
assert.deepEqual([...difference], ["wss://relay.example.com"]);
secondRelays.append("wss://relay.example.com");
assert.deepEqual([...intersection], ["wss://relay.example.com"]);

const opened = [];

class InjectedWebSocket {
  readyState = 0;
  onopen = null;
  onmessage = null;
  onerror = null;
  onclose = null;

  constructor(url) {
    opened.push(url);
  }

  send() {}

  close() {
    this.readyState = 3;

    this.onclose?.({ code: 1000, reason: "closed", wasClean: true });
  }
}

const injectedClient = new RxNostr({
  verifier: new JsVerifier(),
  WebSocket: InjectedWebSocket,
  skipFetchNip11: true,
});

injectedClient.setHotRelays("wss://injected.example.com");
assert.deepEqual(opened, ["wss://injected.example.com"]);
injectedClient.dispose();

request.dispose();
difference.dispose();
intersection.dispose();
union.dispose();
secondRelays.dispose();
relays.dispose();
client.dispose();

console.log("Packed ESM entries and WASM verifier: OK");
