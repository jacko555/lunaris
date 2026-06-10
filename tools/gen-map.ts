import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Rng, encodeTiles, type IlluminationClass, type Tile } from "@lunaris/sim-core";

/**
 * Generates data/base/maps.json: the 64×64 Shackleton-rim site (TASKS.md M2).
 * Deterministic (fixed seed) — regenerate with `pnpm gen:map` only when the
 * map design changes, and expect golden hashes to move (explain in the PR).
 *
 * Layout (LRO-inspired stylization, not real DEM data):
 * - Crater centered at (44, 44), radius 19 tiles: interior is PSR (class C),
 *   pinned dark, ice-bearing per LCROSS Cabeus statistics.
 * - Rim ring: high elevation; its north-west arc is the "near-eternal
 *   light" class-A ridge (the buildable prize of the site).
 * - Everything else: class-B polar highland with gentle relief.
 */

const SEED = 904; // Shackleton's IAU crater designation year, arbitrary but fixed
const WIDTH = 64;
const HEIGHT = 64;
const CRATER_X = 44;
const CRATER_Y = 44;
const CRATER_RADIUS = 19;
const RIM_WIDTH = 3;

const rng = new Rng(SEED);
const tiles: Tile[] = [];

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const distance = Math.hypot(x - CRATER_X, y - CRATER_Y);
    let illumClass: IlluminationClass;
    let elevationM: number;
    let slopeDeg: number;
    let iceFrac = 0;

    if (distance < CRATER_RADIUS - RIM_WIDTH / 2) {
      // Permanently shadowed crater interior.
      illumClass = "C";
      const depthFrac = 1 - distance / CRATER_RADIUS;
      elevationM = Math.round(-3500 * depthFrac - 200 + rng.nextInt(-50, 50));
      slopeDeg =
        distance > CRATER_RADIUS - RIM_WIDTH / 2 - 4
          ? rng.nextInt(16, 30) // inner crater wall
          : rng.nextInt(0, 6); // crater floor
      // LCROSS Cabeus range 2.7–8.5 wt%; crater walls hold about half the
      // floor concentration.
      iceFrac = 0.027 + rng.next() * (0.085 - 0.027);
      if (slopeDeg > 15) {
        iceFrac *= 0.5;
      }
    } else if (distance < CRATER_RADIUS + RIM_WIDTH) {
      // Rim ring. North-west arc gets near-eternal light (class A).
      const angle = Math.atan2(y - CRATER_Y, x - CRATER_X); // -π..π
      const isSunwardArc = angle > -Math.PI * 0.95 && angle < -Math.PI * 0.35;
      illumClass = isSunwardArc ? "A" : "B";
      elevationM = 300 + rng.nextInt(0, 200);
      slopeDeg = isSunwardArc ? rng.nextInt(2, 5) : rng.nextInt(6, 18);
    } else if (x >= 4 && x <= 24 && y >= 4 && y <= 24) {
      // The "landing plains": a graded-flat region NW of the crater chosen
      // as the outpost site — guarantees buildable footprints near the
      // class-A ridge arc.
      illumClass = "B";
      elevationM = rng.nextInt(-40, 40);
      slopeDeg = rng.nextInt(0, 3);
    } else {
      // Polar highland with occasional rough patches.
      illumClass = "B";
      elevationM = rng.nextInt(-150, 150);
      slopeDeg = rng.chance(0.12) ? rng.nextInt(11, 24) : rng.nextInt(0, 8);
    }

    tiles.push({
      elevationM,
      illumClass,
      iceFrac,
      regolith: "highland", // Shackleton is highland terrain throughout
      slopeDeg,
    });
  }
}

const map = {
  id: "shackleton_rim",
  name: "Shackleton Rim",
  size: [WIDTH, HEIGHT],
  tiles: encodeTiles(tiles),
  iceUncertainty: true,
  lavaTubes: [],
  source: "LRO-inspired stylization of the Shackleton crater south-pole site (not real DEM data)",
  as_of: "2026-06",
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "base", "maps.json");
writeFileSync(out, `${JSON.stringify([map], null, 2)}\n`, "utf8");

const counts = { A: 0, B: 0, C: 0 };
for (const tile of tiles) {
  counts[tile.illumClass]++;
}
console.log(`Wrote ${out}`);
console.log(`Tiles: ${tiles.length} — class A ${counts.A}, B ${counts.B}, C ${counts.C}`);
console.log(`Encoded size: ${map.tiles.length} chars`);
