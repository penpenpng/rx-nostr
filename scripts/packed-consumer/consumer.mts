import { SimpleVerifier as JsVerifier, SeckeySigner as JsSigner } from "@rx-nostr/crypto";
import { SimpleVerifier as WasmVerifier, SeckeySigner as WasmSigner } from "@rx-nostr/crypto-wasm";
import type * as Nostr from "nostr-typedef";
import { RxNostr, RxRelays, RxReq, type EventSigner, type EventVerifier } from "rx-nostr";
import { createLegacyRxNostr, type ILegacyRxNostr } from "rx-nostr/legacy";
import { latestEach } from "rx-nostr/operators";
import { ensureEventFields, now } from "rx-nostr/utils";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends false> = T;
type RootIsTyped = Assert<IsAny<typeof RxNostr>>;
type OperatorsAreTyped = Assert<IsAny<typeof latestEach>>;
type UtilsAreTyped = Assert<IsAny<typeof ensureEventFields>>;
type LegacyIsTyped = Assert<IsAny<typeof createLegacyRxNostr>>;
type JsCryptoIsTyped = Assert<IsAny<typeof JsVerifier>>;
type WasmCryptoIsTyped = Assert<IsAny<typeof WasmVerifier>>;

const verifier: EventVerifier = new JsVerifier();
const wasmVerifier: EventVerifier = new WasmVerifier();
const jsSigner: EventSigner = new JsSigner(
  "7f3fd51b45881fd8402fea2182f43fd3111a905180ff3a05a90645be6797b4f9",
);
const wasmSigner: EventSigner = new WasmSigner(
  "7f3fd51b45881fd8402fea2182f43fd3111a905180ff3a05a90645be6797b4f9",
);
const legacyFactory: () => ILegacyRxNostr = createLegacyRxNostr;
const clock: number = now();
const structural: boolean = ensureEventFields({});
const request: RxReq = new RxReq();
const relays: RxRelays = new RxRelays();
const client: RxNostr = new RxNostr({ verifier });
const event: Nostr.Event = {
  id: "id",
  sig: "signature",
  kind: 1,
  tags: [],
  pubkey: "pubkey",
  content: "",
  created_at: 1,
};

void ([
  wasmVerifier,
  jsSigner,
  wasmSigner,
  legacyFactory,
  latestEach,
  clock,
  structural,
  request,
  relays,
  client,
  event,
] satisfies unknown[]);

export type PackedTypeAssertions = [
  RootIsTyped,
  OperatorsAreTyped,
  UtilsAreTyped,
  LegacyIsTyped,
  JsCryptoIsTyped,
  WasmCryptoIsTyped,
];
