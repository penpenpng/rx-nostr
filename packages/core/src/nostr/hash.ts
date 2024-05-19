import { schnorr as _schnorr } from "@noble/curves/secp256k1";
import { sha256 as _sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const utf8Encoder = new TextEncoder();

export function sha256(m: string): string {
  return bytesToHex(_sha256(utf8Encoder.encode(m)));
}

interface Schnorr {
  sign(m: string, seckey: string): string;
  verify(sig: string, m: string, pubkey: string): boolean;
  getPublicKey(seckey: string): string;
}

export const schnorr: Schnorr = {
  sign: (m: string, seckey: string): string =>
    bytesToHex(_schnorr.sign(m, seckey)),
  verify: _schnorr.verify,
  getPublicKey: (seckey: string) => bytesToHex(_schnorr.getPublicKey(seckey)),
};
