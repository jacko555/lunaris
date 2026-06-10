import type { GameMap } from "../schema/items.js";
import { decodeBase64, encodeBase64 } from "./base64.js";

/**
 * Tile model and the RLE-base64 codec behind the map schema's `tiles` field
 * (docs/DATA-SCHEMA.md §Map). Maps are static content, not world state:
 * systems read tiles from the loaded map; only mutable per-tile effects
 * (dust, prospecting reveals — later milestones) live in components.
 *
 * Wire format, 4 bytes per tile, run-length encoded:
 *   byte 0      elevation: (elevationM + 6000) / 50, clamped to 0–255
 *   byte 1      bits 7–6 illumination class (0=A eternal-light ridge,
 *               1=B standard polar, 2=C PSR); bits 5–1 slope degrees (0–31);
 *               bit 0 regolith (0=highland, 1=mare)
 *   bytes 2–3   ice mass fraction × 1e4, uint16 little-endian
 * Runs: [count uint16 LE][tile 4 bytes], repeated; then base64.
 */

export type IlluminationClass = "A" | "B" | "C";
export type RegolithType = "highland" | "mare";

export interface Tile {
  elevationM: number;
  illumClass: IlluminationClass;
  /** Water-ice mass fraction (0–0.085 per LCROSS range), not percent. */
  iceFrac: number;
  regolith: RegolithType;
  slopeDeg: number;
}

export interface LunarMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Tile[];
  def: GameMap;
}

const ILLUM_CLASSES: IlluminationClass[] = ["A", "B", "C"];
const ELEVATION_OFFSET_M = 6000;
const ELEVATION_STEP_M = 50;

function packTile(tile: Tile): [number, number, number, number] {
  const elev = Math.max(
    0,
    Math.min(255, Math.round((tile.elevationM + ELEVATION_OFFSET_M) / ELEVATION_STEP_M)),
  );
  const illum = ILLUM_CLASSES.indexOf(tile.illumClass);
  if (illum < 0) {
    throw new Error(`Unknown illumination class '${tile.illumClass}'`);
  }
  const slope = Math.max(0, Math.min(31, Math.round(tile.slopeDeg)));
  const rego = tile.regolith === "mare" ? 1 : 0;
  const ice = Math.max(0, Math.min(0xffff, Math.round(tile.iceFrac * 1e4)));
  return [elev, (illum << 6) | (slope << 1) | rego, ice & 0xff, (ice >> 8) & 0xff];
}

function unpackTile(b0: number, b1: number, b2: number, b3: number): Tile {
  const illumIndex = (b1 >> 6) & 0x03;
  const illumClass = ILLUM_CLASSES[illumIndex];
  if (illumClass === undefined) {
    throw new Error(`Corrupt tile: illumination class index ${illumIndex}`);
  }
  return {
    elevationM: b0 * ELEVATION_STEP_M - ELEVATION_OFFSET_M,
    illumClass,
    iceFrac: ((b3 << 8) | b2) / 1e4,
    regolith: (b1 & 0x01) === 1 ? "mare" : "highland",
    slopeDeg: (b1 >> 1) & 0x1f,
  };
}

function sameTile(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function encodeTiles(tiles: Tile[]): string {
  const bytes: number[] = [];
  let i = 0;
  while (i < tiles.length) {
    const packed = packTile(tiles[i] as Tile);
    let run = 1;
    while (
      i + run < tiles.length &&
      run < 0xffff &&
      sameTile(packed, packTile(tiles[i + run] as Tile))
    ) {
      run++;
    }
    bytes.push(run & 0xff, (run >> 8) & 0xff, ...packed);
    i += run;
  }
  return encodeBase64(new Uint8Array(bytes));
}

export function decodeTiles(encoded: string, expectedCount: number): Tile[] {
  const bytes = decodeBase64(encoded);
  if (bytes.length % 6 !== 0) {
    throw new Error(`Corrupt tile stream: ${bytes.length} bytes is not a whole number of runs`);
  }
  const tiles: Tile[] = [];
  for (let i = 0; i < bytes.length; i += 6) {
    const count = (bytes[i] as number) | ((bytes[i + 1] as number) << 8);
    const tile = unpackTile(
      bytes[i + 2] as number,
      bytes[i + 3] as number,
      bytes[i + 4] as number,
      bytes[i + 5] as number,
    );
    for (let n = 0; n < count; n++) {
      tiles.push({ ...tile });
    }
  }
  if (tiles.length !== expectedCount) {
    throw new Error(`Map tile count ${tiles.length} does not match size (${expectedCount})`);
  }
  return tiles;
}

export function loadMap(def: GameMap): LunarMap {
  const [width, height] = def.size;
  return {
    id: def.id,
    name: def.name,
    width,
    height,
    tiles: decodeTiles(def.tiles, width * height),
    def,
  };
}

export function tileAt(map: LunarMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    throw new Error(`Tile (${x}, ${y}) outside map ${map.width}×${map.height}`);
  }
  return map.tiles[y * map.width + x] as Tile;
}

export function inBounds(map: LunarMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}
