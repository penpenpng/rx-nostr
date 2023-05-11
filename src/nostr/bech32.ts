import { bech32 } from "bech32";

export function toHex(str: string) {
  return hexEncode(fromWords(bech32.decode(str).words));
}

function hexEncode(buf: number[]) {
  let str = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    str += hexChar(c >> 4);
    str += hexChar(c & 0xf);
  }
  return str;
}

function hexChar(val: number) {
  if (val < 10) return String.fromCharCode(48 + val);
  else return String.fromCharCode(97 + val - 10);
}

function fromWords(words: number[]) {
  const res = convertbits(words, 5, 8, false);
  if (Array.isArray(res)) return res;
  throw new Error(res);
}

function convertbits(
  data: number[],
  inBits: number,
  outBits: number,
  pad: boolean
) {
  let value = 0;
  let bits = 0;
  const maxV = (1 << outBits) - 1;
  const result = [];
  for (let i = 0; i < data.length; ++i) {
    value = (value << inBits) | data[i];
    bits += inBits;
    while (bits >= outBits) {
      bits -= outBits;
      result.push((value >> bits) & maxV);
    }
  }
  if (pad) {
    if (bits > 0) {
      result.push((value << (outBits - bits)) & maxV);
    }
  } else {
    if (bits >= inBits) return "Excess padding";
    if ((value << (outBits - bits)) & maxV) return "Non-zero padding";
  }
  return result;
}
