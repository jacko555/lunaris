import { describe, expect, it } from "vitest";
import { fnv1a32, hashValue } from "../hash.js";

describe("fnv1a32", () => {
  it("matches published FNV-1a test vectors", () => {
    expect(fnv1a32("")).toBe("811c9dc5");
    expect(fnv1a32("a")).toBe("e40c292c");
    expect(fnv1a32("foobar")).toBe("bf9cf968");
  });

  it("is sensitive to single-character changes", () => {
    expect(fnv1a32("tick-1000")).not.toBe(fnv1a32("tick-1001"));
  });
});

describe("hashValue", () => {
  it("hashes equal structures equally regardless of key order", () => {
    expect(hashValue({ a: 1, b: [2, 3] })).toBe(hashValue({ b: [2, 3], a: 1 }));
  });

  it("distinguishes different structures", () => {
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});
