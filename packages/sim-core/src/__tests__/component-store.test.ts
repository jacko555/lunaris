import { describe, expect, it } from "vitest";
import { ComponentStore } from "../ecs/component-store.js";

type Pos = { x: number; y: number };

describe("ComponentStore", () => {
  it("iterates entities in ascending id order regardless of insertion order", () => {
    const store = new ComponentStore<Pos>("pos");
    store.set(30, { x: 3, y: 0 });
    store.set(10, { x: 1, y: 0 });
    store.set(20, { x: 2, y: 0 });
    expect(store.entities()).toEqual([10, 20, 30]);
    expect([...store.entries()].map(([id]) => id)).toEqual([10, 20, 30]);
  });

  it("supports get/require/has/remove", () => {
    const store = new ComponentStore<Pos>("pos");
    store.set(1, { x: 0, y: 0 });
    expect(store.get(1)).toEqual({ x: 0, y: 0 });
    expect(store.get(2)).toBeUndefined();
    expect(store.require(1)).toEqual({ x: 0, y: 0 });
    expect(() => store.require(2)).toThrow(/missing on entity 2/);
    expect(store.has(1)).toBe(true);
    expect(store.remove(1)).toBe(true);
    expect(store.has(1)).toBe(false);
    expect(store.size).toBe(0);
  });

  it("round-trips through serialize/load preserving sorted order", () => {
    const store = new ComponentStore<Pos>("pos");
    store.set(5, { x: 5, y: 5 });
    store.set(2, { x: 2, y: 2 });
    const copy = new ComponentStore<Pos>("pos");
    copy.load(store.serialize());
    expect(copy.serialize()).toEqual([
      [2, { x: 2, y: 2 }],
      [5, { x: 5, y: 5 }],
    ]);
  });

  it("quantizeAll quantizes every component", () => {
    const store = new ComponentStore<Pos>("pos");
    store.set(1, { x: 0.1 + 0.2, y: 1.0000000004 });
    store.quantizeAll();
    expect(store.get(1)).toEqual({ x: 0.3, y: 1 });
  });
});
