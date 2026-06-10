import type { JsonValue } from "./types.js";

/**
 * State floats are quantized to 1e-9 at tick end to suppress cross-platform
 * drift before hashing (docs/SDD.md §10).
 */
export const QUANTUM = 1e-9;

export function quantize(x: number): number {
  const scaled = x * 1e9;
  // Beyond ~9e15/1e9 the scaling overflows double precision; such magnitudes
  // are already coarser than the quantum, so pass them through unchanged.
  if (!Number.isFinite(scaled) || Math.abs(scaled) > Number.MAX_SAFE_INTEGER) {
    return x;
  }
  return Math.round(scaled) / 1e9;
}

/** Quantizes every number in a JSON tree in place; returns the (new) value. */
export function deepQuantize(value: JsonValue): JsonValue {
  if (typeof value === "number") {
    return quantize(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = deepQuantize(value[i] as JsonValue);
    }
    return value;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      value[key] = deepQuantize(value[key] as JsonValue);
    }
    return value;
  }
  return value;
}
