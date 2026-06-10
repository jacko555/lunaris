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
  // ── M3 crew/ECLSS/radiation/health (values mirror data/base) ──
  constant("crew_o2_day", 0.84, "kg/person/day"),
  constant("crew_co2_day", 1.0, "kg/person/day"),
  constant("crew_water_potable_day", 3.54, "kg/person/day"),
  constant("crew_hygiene_water_day", 3.5, "kg/person/day"),
  constant("crew_food_dry_day", 0.62, "kg/person/day"),
  constant("o2_reserve_target_days", 3, "days"),
  constant("co2_warning_kg_per_person", 0.5, "kg/person"),
  constant("co2_danger_kg_per_person", 1.0, "kg/person"),
  constant("co2_grace_ticks", 36, "ticks"),
  constant("co2_health_per_hour", 2, "health/h"),
  constant("hypoxia_health_per_hour", 20, "health/h"),
  constant("dehydration_health_per_day", 12, "health/day"),
  constant("starvation_health_per_day", 2.5, "health/day"),
  constant("starvation_morale_per_day", 10, "morale/day"),
  constant("radiation_sickness_health_per_day", 5, "health/day"),
  constant("bone_muscle_drift_per_month", 0.5, "health/month"),
  constant("clinic_heal_per_day", 1, "health/day"),
  constant("clinic_medkit_per_patient_day", 0.1, "medkits/patient/day"),
  constant("medical_event_rate_per_year_per_crew", 0.05, "events/crew/year"),
  constant("morale_baseline", 70, "morale"),
  constant("morale_recovery_per_day", 2, "morale/day"),
  constant("crowding_morale_per_day", 5, "morale/day"),
  constant("dose_surface_chronic", 0.5, "mSv/day"),
  constant("dose_limit_30day", 250, "mSv"),
  constant("dose_career_limit", 600, "mSv"),
  constant("spe_shelter_min", 4, "g/cm2"),
  constant("spe_shelter_safe", 10, "g/cm2"),
  {
    id: "radiation_shielding_curve",
    value: {
      "0": 1.0,
      "4": 0.85,
      "10": 0.7,
      "30": 0.55,
      "50": 0.5,
      "75": 0.6,
      "105": 0.5,
      "180": 0.45,
      "300": 0.35,
    },
    unit: "factor by g/cm2",
    source: "test fixture",
    as_of: AS_OF,
  },
  {
    id: "cost_per_kg_surface",
    value: { legacy: 1000000, clps: 250000, heavy: 100000, starshipTarget: 10000 },
    unit: "USD/kg",
    source: "test fixture",
    as_of: AS_OF,
  },
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
  building({
    id: "hab",
    massKg: 12000,
    powerKw: -6,
    heatKw: 4,
    radiatorKw: 6,
    priorityTier: 0,
    services: { housing: 4 },
    shieldingGcm2: 5,
  }),
  building({
    id: "shelter",
    massKg: 3000,
    powerKw: -0.5,
    heatKw: 0.5,
    radiatorKw: 1,
    priorityTier: 0,
    services: { shelter: 8 },
    shieldingGcm2: 10,
  }),
  building({
    id: "eclss",
    massKg: 2500,
    powerKw: -4,
    heatKw: 2,
    radiatorKw: 3,
    priorityTier: 0,
    eclss: { scrubberKgCo2Day: 8, ogaKgO2Day: 9, waterRecovery: 0.93, waterKgDay: 60 },
  }),
  building({
    id: "sabatier",
    massKg: 500,
    powerKw: -2,
    heatKw: 1,
    radiatorKw: 2,
    priorityTier: 2,
    eclss: { sabatierKgCo2Day: 6 },
  }),
  building({
    id: "gym",
    massKg: 1000,
    powerKw: -1,
    heatKw: 0.5,
    radiatorKw: 1,
    priorityTier: 2,
    services: { exercise: 4 },
  }),
  building({
    id: "clinic",
    massKg: 1500,
    powerKw: -1.5,
    heatKw: 0.5,
    radiatorKw: 1,
    priorityTier: 1,
    services: { medical: 2 },
  }),
  building({ id: "tank", massKg: 1000, powerKw: -0.1, priorityTier: 2 }),
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

function resource(id: string, storageClass: string): Record<string, unknown> {
  return {
    id,
    name: id,
    phase: 2,
    storageClass,
    densityKgM3: 500,
    boiloffPerDay: 0,
    importCostPerKg: 100000,
    source: "test fixture",
    as_of: AS_OF,
  };
}

export const TEST_RESOURCES = [
  resource("water", "bulk"),
  resource("wastewater", "bulk"),
  resource("o2-gas", "pressurized"),
  resource("co2-gas", "pressurized"),
  resource("h2-gas", "pressurized"),
  resource("ch4-gas", "pressurized"),
  resource("food", "ambient"),
  resource("medkits", "ambient"),
];

export function makeTestPack(): ContentPack {
  return loadContentPack("test", {
    constants: TEST_CONSTANTS,
    buildings: TEST_BUILDINGS,
    resources: TEST_RESOURCES,
  });
}
