import { readFileSync, writeFileSync } from "node:fs";
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

// ── BYTE-STABILITY GUARD: every golden depends on this exact encoding. ──
{
  const existing = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "data", "base", "maps.json"),
      "utf8",
    ),
  ) as { id: string; tiles: string }[];
  const prior = existing.find((m) => m.id === "shackleton_rim");
  if (prior !== undefined && prior.tiles !== map.tiles) {
    throw new Error(
      "shackleton_rim regenerated DIFFERENTLY — the generator drifted. " +
        "Fix the generator; do not ship a silently changed map.",
    );
  }
}

/**
 * Site 2 — de Gerlache Rim (TASKS post-M8 content): the harder bargain.
 * A NARROWER eternal-light arc (class A is scarce), but the PSR floor is
 * ice-richer at the top of the LCROSS band and there are TWO shadowed
 * craters: a big mining prize SE and a small near-base pocket NE — shorter
 * first-water hauls, worse long-term power. Separate Rng so neither site's
 * stream can ever perturb the other.
 */
const rng2 = new Rng(1944); // de Gerlache's namesake expedition year (Belgica)
const tiles2: Tile[] = [];
const C2 = { x: 46, y: 42, r: 17 };
const POCKET = { x: 30, y: 12, r: 5 };
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const dMain = Math.hypot(x - C2.x, y - C2.y);
    const dPocket = Math.hypot(x - POCKET.x, y - POCKET.y);
    let illumClass: IlluminationClass;
    let elevationM: number;
    let slopeDeg: number;
    let iceFrac = 0;

    if (dMain < C2.r - RIM_WIDTH / 2 || dPocket < POCKET.r) {
      illumClass = "C";
      const inPocket = dPocket < POCKET.r;
      const depthFrac = inPocket ? 1 - dPocket / POCKET.r : 1 - dMain / C2.r;
      elevationM = Math.round((inPocket ? -900 : -3200) * depthFrac - 150 + rng2.nextInt(-50, 50));
      const nearWall = inPocket ? dPocket > POCKET.r - 2 : dMain > C2.r - RIM_WIDTH / 2 - 4;
      slopeDeg = nearWall ? rng2.nextInt(14, 28) : rng2.nextInt(0, 6);
      // Richer deposit: upper half of the LCROSS band.
      iceFrac = 0.056 + rng2.next() * (0.085 - 0.056);
      if (slopeDeg > 15) {
        iceFrac *= 0.5;
      }
    } else if (dMain < C2.r + RIM_WIDTH) {
      const angle = Math.atan2(y - C2.y, x - C2.x);
      // Half the arc Shackleton gets: the site's defining scarcity.
      const isSunwardArc = angle > -Math.PI * 0.8 && angle < -Math.PI * 0.5;
      illumClass = isSunwardArc ? "A" : "B";
      elevationM = 280 + rng2.nextInt(0, 180);
      slopeDeg = isSunwardArc ? rng2.nextInt(2, 5) : rng2.nextInt(6, 18);
    } else if (x >= 6 && x <= 26 && y >= 18 && y <= 34) {
      // Landing plains sit BETWEEN the two PSRs.
      illumClass = "B";
      elevationM = rng2.nextInt(-40, 40);
      slopeDeg = rng2.nextInt(0, 3);
    } else {
      illumClass = "B";
      elevationM = rng2.nextInt(-180, 180);
      slopeDeg = rng2.chance(0.16) ? rng2.nextInt(11, 26) : rng2.nextInt(0, 8);
    }

    tiles2.push({ elevationM, illumClass, iceFrac, regolith: "highland", slopeDeg });
  }
}

const map2 = {
  id: "de_gerlache_rim",
  name: "de Gerlache Rim",
  size: [WIDTH, HEIGHT],
  tiles: encodeTiles(tiles2),
  iceUncertainty: true,
  lavaTubes: [],
  source:
    "LRO-inspired stylization of the de Gerlache south-pole site: scarcer eternal light, richer twin PSRs (not real DEM data)",
  as_of: "2026-06",
};

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "base", "maps.json");
writeFileSync(out, `${JSON.stringify([map, map2], null, 2)}\n`, "utf8");

for (const [label, list] of [
  ["shackleton_rim", tiles],
  ["de_gerlache_rim", tiles2],
] as [string, Tile[]][]) {
  const counts = { A: 0, B: 0, C: 0 };
  for (const tile of list) {
    counts[tile.illumClass]++;
  }
  console.log(`${label}: class A ${counts.A}, B ${counts.B}, C ${counts.C}`);
}
console.log(`Wrote ${out}`);
