import { describe, expect, it } from "vitest";
import { decodeBase64, encodeBase64 } from "../map/base64.js";
import { decodeTiles, encodeTiles, loadMap, tileAt, type Tile } from "../map/tiles.js";
import { makeTestMap } from "./fixtures.js";

describe("base64 codec", () => {
  it("round-trips arbitrary byte streams", () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255, 0]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array(Array.from({ length: 100 }, (_, i) => (i * 37) % 256)),
    ];
    for (const bytes of cases) {
      expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    }
  });

  it("matches the standard alphabet", () => {
    expect(encodeBase64(new Uint8Array([77, 97, 110]))).toBe("TWFu"); // "Man"
    expect(encodeBase64(new Uint8Array([77]))).toBe("TQ==");
  });

  it("rejects malformed input", () => {
    expect(() => decodeBase64("abc")).toThrow(/multiple of 4/);
    expect(() => decodeBase64("ab!=")).toThrow(/invalid character/);
  });
});

describe("tile codec", () => {
  const tile = (overrides: Partial<Tile>): Tile => ({
    elevationM: 0,
    illumClass: "B",
    iceFrac: 0,
    regolith: "highland",
    slopeDeg: 0,
    ...overrides,
  });

  it("round-trips quantized tiles exactly", () => {
    const tiles: Tile[] = [
      tile({}),
      tile({ elevationM: -4000, illumClass: "C", iceFrac: 0.056, slopeDeg: 12 }),
      tile({ elevationM: 450, illumClass: "A", slopeDeg: 3 }),
      tile({ regolith: "mare", slopeDeg: 31 }),
    ];
    expect(decodeTiles(encodeTiles(tiles), tiles.length)).toEqual(tiles);
  });

  it("run-length compresses repeated tiles", () => {
    const uniform: Tile[] = Array.from({ length: 4096 }, () => tile({}));
    const encoded = encodeTiles(uniform);
    expect(encoded.length).toBeLessThan(20); // one run: 6 bytes → 8 chars
    expect(decodeTiles(encoded, 4096)).toHaveLength(4096);
  });

  it("rejects tile-count mismatches", () => {
    const encoded = encodeTiles([tile({})]);
    expect(() => decodeTiles(encoded, 2)).toThrow(/does not match/);
  });

  it("loadMap exposes tiles by coordinate", () => {
    const map = makeTestMap();
    expect(map.width).toBe(8);
    expect(tileAt(map, 7, 0).illumClass).toBe("C");
    expect(tileAt(map, 6, 0).illumClass).toBe("A");
    expect(tileAt(map, 0, 0).illumClass).toBe("B");
    expect(tileAt(map, 7, 0).iceFrac).toBeCloseTo(0.056, 9);
    expect(() => tileAt(map, 8, 0)).toThrow(/outside map/);
    expect(loadMap(map.def).tiles).toEqual(map.tiles);
  });
});
