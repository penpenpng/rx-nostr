import { bytesToHex } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";

/** Convert bech32 format string to HEX format string. */
export function toHex(str: string): string {
  const { words } = bech32.decode(str as `${string}1${string}`);
  const data = new Uint8Array(bech32.fromWords(words));
  return bytesToHex(data);
}
