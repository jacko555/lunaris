import { describe, expect, it } from "vitest";
import { deepQuantize, quantize } from "../quantize.js";

describe("quantize", () => {
  it("rounds to 1e-9", () => {
    expect(quantize(0.1 + 0.2)).toBe(0.3);
    expect(quantize(1.0000000004)).toBe(1);
    expect(quantize(1.0000000006)).toBe(1.000000001);
  });

  it("is idempotent", () => {
    const q = quantize(123.456789123456);
    expect(quantize(q)).toBe(q);
  });

  it("passes through magnitudes too large to scale", () => {
    expect(quantize(1e300)).toBe(1e300);
    expect(quantize(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("handles negatives and zero", () => {
    expect(quantize(-0.30000000004)).toBe(-0.3);
    expect(quantize(0)).toBe(0);
  });
});

describe("deepQuantize", () => {
  it("quantizes nested numbers in place", () => {
    const value = { a: 0.1 + 0.2, list: [1.0000000004, { b: 2.0000000009 }] };
    deepQuantize(value);
    expect(value).toEqual({ a: 0.3, list: [1, { b: 2.000000001 }] });
  });

  it("leaves non-numbers untouched", () => {
    const value = { s: "x", b: true, n: null };
    deepQuantize(value);
    expect(value).toEqual({ s: "x", b: true, n: null });
  });
});
