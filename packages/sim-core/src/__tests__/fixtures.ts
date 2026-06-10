import { loadContentPack, type ContentPack } from "../schema/content-pack.js";
import { encodeTiles, loadMap, type LunarMap, type Tile } from "../map/tiles.js";
import type { GameMap } from "../schema/items.js";

/**
 * Inline fixture content for system unit tests (sim-core tests cannot read
 * data/ from disk — that's the root-level suite's job). Values mirror the
 * base pack but are owned by the tests: tweaking game balance must not
 * silently change unit-test expectations.
 */

const AS_OF = "2026-06";

function constant(id: string, value: number, unit: string): Record<string, unknown> {
  return { id, value, unit, source: "test fixture", as_of: AS_OF };
}

export const TEST_CONSTANTS = [
  constant("day_synodic", 29.53, "Earth days"),
  constant("temp_day_max", 400, "K"),
  constant("temp_night_min", 100, "K"),
  constant("temp_psr", 40, "K"),
  constant("temp_internal_target", 295, "K"),
  constant("temp_freeze", 273, "K"),
  constant("temp_overheat", 310, "K"),
  constant("thermal_leak_kw_per_k_per_tonne", 0.00083, "kW/K per tonne"),
  constant("building_specific_heat", 1.0, "kJ/(kg*K)"),
  constant("heater_max_kw", 5, "kW"),
  constant("thermal_damage_rate_per_hour", 0.002, "condition/h"),
  constant("radiator_night_multiplier", 1.6, "factor"),
];

function building(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    name: overrides["id"],
    tier: 2,
    phase: 2,
    analogue: "test",
    source: "test fixture",
    as_of: AS_OF,
    footprint: [1, 1],
    heatKw: 0,
    priorityTier: null,
    buildCost: { imported: [], local: [] },
    placement: { terrain: ["highland", "mare"], maxSlope: 31, requiresPSR: false },
    reactions: [],
    techRequired: null,
    ...overrides,
  };
}

export const TEST_BUILDINGS = [
  building({ id: "hab", massKg: 12000, powerKw: -6, heatKw: 4, radiatorKw: 6, priorityTier: 0 }),
  building({ id: "solar", massKg: 1000, powerKw: 10, powerScalesWithIllumination: true }),
  building({
    id: "battery",
    massKg: 1000,
    powerKw: 0,
    storageKwh: 200,
    storageRoundTripEff: 0.9,
  }),
  building({ id: "fission", massKg: 6000, powerKw: 40, heatKw: 8 }),
  building({
    id: "radiator",
    massKg: 800,
    powerKw: -0.2,
    radiatorKw: 15,
    radiatorShared: true,
    priorityTier: 1,
  }),
  building({ id: "industry", massKg: 1000, powerKw: -10, priorityTier: 3 }),
  building({ id: "lab", massKg: 1000, powerKw: -5, priorityTier: 2 }),
];

/** 8×8: column x=7 is PSR (class C); x=6 is class A ridge; rest class B flat highland. */
export function makeTestMap(): LunarMap {
  const tiles: Tile[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      tiles.push({
        elevationM: 0,
        illumClass: x === 7 ? "C" : x === 6 ? "A" : "B",
        iceFrac: x === 7 ? 0.056 : 0,
        regolith: "highland",
        slopeDeg: y === 7 ? 20 : 0,
      });
    }
  }
  const def: GameMap = {
    id: "test_map",
    name: "Test Map",
    size: [8, 8],
    tiles: encodeTiles(tiles),
    iceUncertainty: false,
    lavaTubes: [],
    source: "test fixture",
    as_of: AS_OF,
  };
  return loadMap(def);
}

export function makeTestPack(): ContentPack {
  return loadContentPack("test", {
    constants: TEST_CONSTANTS,
    buildings: TEST_BUILDINGS,
  });
}
