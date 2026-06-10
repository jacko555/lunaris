import { describe, expect, it } from "vitest";
import { Rng } from "../rng.js";

describe("Rng (mulberry32)", () => {
  it("produces the reference mulberry32 stream for seed 42", () => {
    const rng = new Rng(42);
    expect([rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it("produces the reference stream for seed 123456789", () => {
    const rng = new Rng(123456789);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([
      0.2577907438389957, 0.9707721115555614, 0.7853280142880976,
    ]);
  });

  it("is deterministic: equal seeds yield equal streams", () => {
    const a = new Rng(2026);
    const b = new Rng(2026);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("differs across seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const aDraws = Array.from({ length: 10 }, () => a.next());
    const bDraws = Array.from({ length: 10 }, () => b.next());
    expect(aDraws).not.toEqual(bDraws);
  });

  it("round-trips through serialized state mid-stream", () => {
    const original = new Rng(777);
    original.next();
    original.next();
    const resumed = Rng.fromState(original.getState());
    for (let i = 0; i < 100; i++) {
      expect(resumed.next()).toBe(original.next());
    }
  });

  it("coerces seeds to uint32 (equivalent seeds share a stream)", () => {
    expect(new Rng(0).next()).toBe(new Rng(2 ** 32).next());
  });

  it("stays in [0, 1) with a sane mean", () => {
    const rng = new Rng(42);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it("nextInt covers [min, max] inclusive and stays in bounds", () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("nextInt rejects invalid ranges", () => {
    const rng = new Rng(7);
    expect(() => rng.nextInt(5, 1)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 2)).toThrow(RangeError);
  });

  it("chance(0) is never true and chance(1) is always true", () => {
    const rng = new Rng(99);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it("pick draws only from the given array and rejects empty arrays", () => {
    const rng = new Rng(3);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
