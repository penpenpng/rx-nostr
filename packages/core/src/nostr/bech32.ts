import { bytesToHex } from "@noble/hashes/utils";
import { bech32 } from "@scure/base";

/** Convert bech32 format string to HEX format string. */
export function toHex(str: string): string {
  const { words } = bech32.decode(str);
  const data = new Uint8Array(bech32.fromWords(words));
  return bytesToHex(data);
}
