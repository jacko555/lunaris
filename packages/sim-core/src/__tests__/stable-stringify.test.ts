import { describe, expect, it } from "vitest";
import { stableStringify } from "../stable-stringify.js";

describe("stableStringify", () => {
  it("sorts object keys at every depth", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is independent of key insertion order", () => {
    const a = { x: 1, y: 2, z: [{ q: 1, p: 2 }] };
    const b = { z: [{ p: 2, q: 1 }], y: 2, x: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("normalizes -0 to 0", () => {
    expect(stableStringify(-0)).toBe("0");
    expect(stableStringify({ v: -0 })).toBe(stableStringify({ v: 0 }));
  });

  it("handles primitives and null", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify('a"b')).toBe('"a\\"b"');
    expect(stableStringify(1.5)).toBe("1.5");
  });

  it("throws on NaN and Infinity", () => {
    expect(() => stableStringify(NaN)).toThrow(TypeError);
    expect(() => stableStringify({ deep: [Infinity] })).toThrow(TypeError);
  });

  it("throws on undefined values", () => {
    expect(() => stableStringify({ a: undefined })).toThrow(TypeError);
    expect(() => stableStringify(undefined)).toThrow(TypeError);
  });

  it("throws on Maps, Sets, and class instances", () => {
    expect(() => stableStringify(new Map())).toThrow(TypeError);
    expect(() => stableStringify(new Set())).toThrow(TypeError);
    class Thing {
      x = 1;
    }
    expect(() => stableStringify(new Thing())).toThrow(TypeError);
  });

  it("reports the path of the offending value", () => {
    expect(() => stableStringify({ a: { b: [1, NaN] } })).toThrow(/\$\.a\.b\[1\]/);
  });
});
