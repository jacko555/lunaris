/**
 * Canonical JSON serialization for hashing and serializability guards
 * (docs/TAD.md §4): object keys sorted by code point, arrays in order,
 * -0 normalized to 0. Throws on anything that cannot round-trip
 * deterministically (NaN/Infinity, undefined, Map/Set/class instances) —
 * such values in world state are determinism bugs and must fail loudly.
 */

/** Code-point string comparator — the only sanctioned comparator for state-affecting sorts of strings. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ascending numeric comparator for entity ids and other state-affecting numeric sorts. */
export function compareNumbers(a: number, b: number): number {
  return a - b;
}

export function stableStringify(value: unknown): string {
  return write(value, "$");
}

function write(value: unknown, path: string): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`stableStringify: non-finite number at ${path}`);
      }
      return JSON.stringify(value); // JSON.stringify(-0) === "0"
    case "object":
      break;
    default:
      throw new TypeError(`stableStringify: unsupported ${typeof value} at ${path}`);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      parts.push(write(value[i], `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      `stableStringify: non-plain object at ${path} (Map/Set/class instances must be converted to plain JSON first)`,
    );
  }
  const keys = Object.keys(value).sort(compareStrings);
  const parts: string[] = [];
  for (const key of keys) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) {
      throw new TypeError(`stableStringify: undefined value at ${path}.${key}`);
    }
    parts.push(`${JSON.stringify(key)}:${write(entry, `${path}.${key}`)}`);
  }
  return `{${parts.join(",")}}`;
}
