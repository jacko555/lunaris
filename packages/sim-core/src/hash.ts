import { stableStringify } from "./stable-stringify.js";

/**
 * FNV-1a 32-bit over a string's UTF-16 code units, hex-encoded.
 * Used for golden determinism hashes (docs/TAD.md §4).
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Canonical hash of any JSON-serializable value (key order independent). */
export function hashValue(value: unknown): string {
  return fnv1a32(stableStringify(value));
}
