import signedEvent from "./signed-event.json";
import timestampEvents from "./timestamp-events.json";

/** Fixed NIP-01 signature plus independent mutations; test data only. */
export const verificationVectors: ReadonlyArray<{
  name: string;
  event: unknown;
  valid: boolean;
}> = [
  // Correctly signed boundary inputs; unlike mutations, failures cannot be explained by a stale signature.
  ...timestampEvents,
  { name: "known valid signature", event: signedEvent, valid: true },
  { name: "changed advertised ID", event: { ...signedEvent, id: "0".repeat(64) }, valid: false },
  { name: "changed content", event: { ...signedEvent, content: "changed" }, valid: false },
  { name: "changed pubkey", event: { ...signedEvent, pubkey: "0".repeat(64) }, valid: false },
  { name: "changed signature", event: { ...signedEvent, sig: "0".repeat(128) }, valid: false },
  {
    name: "changed timestamp",
    event: { ...signedEvent, created_at: signedEvent.created_at + 1 },
    valid: false,
  },
  { name: "changed tags", event: { ...signedEvent, tags: [["e", "changed"]] }, valid: false },
  { name: "missing ID", event: { ...signedEvent, id: undefined }, valid: false },
  { name: "missing signature", event: { ...signedEvent, sig: undefined }, valid: false },
  { name: "missing tags", event: { ...signedEvent, tags: undefined }, valid: false },
  { name: "null", event: null, valid: false },
  { name: "array", event: [], valid: false },
  { name: "numeric tag value", event: { ...signedEvent, tags: [["e", 1]] }, valid: false },
  { name: "boolean tag value", event: { ...signedEvent, tags: [["e", true]] }, valid: false },
  { name: "null tag value", event: { ...signedEvent, tags: [["e", null]] }, valid: false },
  { name: "empty tag", event: { ...signedEvent, tags: [[]] }, valid: false },
  { name: "NaN kind", event: { ...signedEvent, kind: NaN }, valid: false },
  { name: "out-of-range kind", event: { ...signedEvent, kind: 65_536 }, valid: false },
  { name: "infinite timestamp", event: { ...signedEvent, created_at: Infinity }, valid: false },
  {
    name: "uppercase ID",
    event: { ...signedEvent, id: signedEvent.id.toUpperCase() },
    valid: false,
  },
  {
    name: "uppercase pubkey",
    event: { ...signedEvent, pubkey: signedEvent.pubkey.toUpperCase() },
    valid: false,
  },
  {
    name: "uppercase signature",
    event: { ...signedEvent, sig: signedEvent.sig.toUpperCase() },
    valid: false,
  },
];
