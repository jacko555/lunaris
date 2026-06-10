/**
 * Pure base64 codec. sim-core cannot use atob/btoa (DOM) or Buffer (Node),
 * so map tile blobs are coded here from first principles.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const REVERSE = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i++) {
  REVERSE.set(ALPHABET[i] as string, i);
}

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
}

export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) {
    throw new Error("base64: length must be a multiple of 4");
  }
  let padding = 0;
  if (text.endsWith("==")) {
    padding = 2;
  } else if (text.endsWith("=")) {
    padding = 1;
  }
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let outIndex = 0;
  for (let i = 0; i < text.length; i += 4) {
    const chars = [text[i], text[i + 1], text[i + 2], text[i + 3]] as string[];
    const values = chars.map((c, j) => {
      if (c === "=" && i + 4 >= text.length && j >= 2) {
        return 0;
      }
      const v = REVERSE.get(c);
      if (v === undefined) {
        throw new Error(`base64: invalid character '${c}' at ${i + j}`);
      }
      return v;
    }) as [number, number, number, number];
    const triple = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    if (outIndex < out.length) {
      out[outIndex++] = (triple >> 16) & 0xff;
    }
    if (outIndex < out.length) {
      out[outIndex++] = (triple >> 8) & 0xff;
    }
    if (outIndex < out.length) {
      out[outIndex++] = triple & 0xff;
    }
  }
  return out;
}
