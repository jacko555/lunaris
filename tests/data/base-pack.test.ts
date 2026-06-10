import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentPack, loadMap, type ContentPackDocuments } from "@lunaris/sim-core";

/**
 * CI schema validation of the shipped base pack (docs/DATA-SCHEMA.md
 * validation rules). `pnpm schema-check` runs exactly this suite.
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "base");

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), "utf8")) as unknown;
}

function loadBasePack() {
  const documents: ContentPackDocuments = {
    constants: readJson("constants"),
    resources: readJson("resources"),
    reactions: readJson("reactions"),
    buildings: readJson("buildings"),
    tech: readJson("tech"),
    events: readJson("events"),
    encyclopedia: readJson("encyclopedia"),
    maps: readJson("maps"),
  };
  return loadContentPack("base", documents);
}

describe("data/base content pack", () => {
  it("validates against the DATA-SCHEMA zod schemas", () => {
    expect(() => loadBasePack()).not.toThrow();
  });

  it("carries the full SDD §1 constants table plus the model-parameter sets", () => {
    const pack = loadBasePack();
    // 45 = SDD master table minus micrometeorite_flux (site-dependent,
    // lives in the EVENTS hazard tables); +8 thermal/power constants (M2);
    // +20 crew/ECLSS/radiation/health (M3); +19 construction/dust/repair/
    // economy/vehicle constants (M4/M5).
    expect(pack.constants.length).toBe(92);
  });

  it("spot-checks sourced values against the SDD", () => {
    const pack = loadBasePack();
    expect(pack.number("crew_o2_day")).toBe(0.84);
    expect(pack.number("gravity_lunar")).toBe(1.62);
    expect(pack.number("mre_energy_per_kgo2")).toBe(33);
    expect(pack.number("dose_limit_30day")).toBe(250);
    expect(pack.constant("ice_concentration_psr").range).toEqual([0.027, 0.085]);
    const fission = pack.constant("fission_unit").value as Record<string, number>;
    expect(fission["powerKwe"]).toBe(40);
    expect(fission["massKg"]).toBe(6000);
  });

  it("flags only known-speculative and known-unsourced constants", () => {
    const pack = loadBasePack();
    const speculative = pack.constants.filter((c) => c.status === "speculative").map((c) => c.id);
    expect(speculative).toEqual([
      "cost_per_kg_surface",
      "lox_demand_kg_per_day",
      "lox_price_usd_per_kg",
      "vehicle_starship",
    ]);
    // Model parameters awaiting engineering citations (CLAUDE.md rule 5).
    const unsourced = pack.constants
      .filter((c) => c.status === "needs_source")
      .map((c) => c.id)
      .sort();
    expect(unsourced).toEqual([
      "building_specific_heat",
      "clinic_heal_per_day",
      "clinic_medkit_per_patient_day",
      "co2_danger_kg_per_person",
      "co2_health_per_hour",
      "co2_warning_kg_per_person",
      "construction_hours_per_tonne",
      "crew_ops_usd_per_day",
      "crowding_morale_per_day",
      "dehydration_health_per_day",
      "dust_cleaning_per_day",
      "dust_landing_spike",
      "heater_max_kw",
      "hypoxia_health_per_hour",
      "morale_baseline",
      "morale_recovery_per_day",
      "o2_reserve_target_days",
      "radiation_sickness_health_per_day",
      "repair_parts_kg_per_point",
      "repair_points_per_day",
      "science_per_scientist_day",
      "sortie_payload_kg",
      "starvation_health_per_day",
      "starvation_morale_per_day",
      "temp_internal_target",
      "thermal_damage_rate_per_hour",
      "thermal_leak_kw_per_k_per_tonne",
    ]);
  });

  it("ships the tier 0–3 building set, resources, reactions, tech, events, and map", () => {
    const pack = loadBasePack();
    expect(pack.buildings.map((b) => b.id)).toEqual([
      "battery-bank",
      "clinic",
      "comms-tower",
      "cryo-plant",
      "eclss-core",
      "electrolyzer",
      "exercise-module",
      "field-lab",
      "fission-surface-power",
      "foundation-habitat",
      "ice-harvester",
      "landing-pad",
      "mre-plant-l",
      "mre-plant-s",
      "propellant-depot-pad",
      "radiator-wing",
      "regen-fuel-cell",
      "regolith-berm",
      "regolith-printer",
      "rtg-keepalive",
      "sabatier-unit",
      "solar-array-10kw",
      "storm-shelter",
      "volatile-oven",
      "water-gas-storage",
    ]);
    expect(pack.building("fission-surface-power").techRequired).toBe("surface_power_40kw");
    expect(pack.building("ice-harvester").mining?.kgPerDay).toBe(720);
    expect(pack.building("mre-plant-s").reactionKgPerDay["mre"]).toBe(2.74);
    expect(pack.reaction("mre").outputs.find((o) => o.resource === "o2-gas")?.kg).toBe(28);
    expect(pack.reaction("sabatier").inputs.map((i) => i.kg)).toEqual([44, 8]);
    expect(pack.tech).toHaveLength(34);
    expect(pack.techNode("orbital_refueling").costScience).toBe(120);
    expect(pack.events.map((e) => e.id)).toEqual([
      "fission-scram",
      "micrometeorite",
      "moonquake",
      "spe-major",
      "spe-minor",
    ]);
    expect(pack.resource("regolith").groundSourced).toBe(true);
    expect(pack.encyclopedia.length).toBeGreaterThanOrEqual(40);
    expect(pack.maps).toHaveLength(1);
  });

  it("the Shackleton map decodes to 64×64 with ridge, PSR, and LCROSS-range ice", () => {
    const pack = loadBasePack();
    const map = loadMap(pack.maps[0] as (typeof pack.maps)[number]);
    expect(map.width).toBe(64);
    expect(map.height).toBe(64);
    const counts = { A: 0, B: 0, C: 0 };
    let maxIce = 0;
    for (const tile of map.tiles) {
      counts[tile.illumClass]++;
      maxIce = Math.max(maxIce, tile.iceFrac);
      if (tile.illumClass !== "C") {
        expect(tile.iceFrac).toBe(0);
      }
    }
    expect(counts.A).toBeGreaterThan(50); // buildable eternal-light ridge
    expect(counts.C).toBeGreaterThan(500); // PSR crater interior
    expect(maxIce).toBeLessThanOrEqual(0.085); // LCROSS upper bound
    expect(maxIce).toBeGreaterThan(0.03);
  });
});
