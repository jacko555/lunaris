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
    // lives in the EVENTS hazard tables); +8 thermal/power constants (M2,
    // SDD §5); +20 crew/ECLSS/radiation/health constants (M3, SDD §4/§6/§9).
    expect(pack.constants.length).toBe(73);
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
    expect(speculative).toEqual(["cost_per_kg_surface"]);
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
      "crowding_morale_per_day",
      "dehydration_health_per_day",
      "heater_max_kw",
      "hypoxia_health_per_hour",
      "morale_baseline",
      "morale_recovery_per_day",
      "o2_reserve_target_days",
      "radiation_sickness_health_per_day",
      "starvation_health_per_day",
      "starvation_morale_per_day",
      "temp_internal_target",
      "thermal_damage_rate_per_hour",
      "thermal_leak_kw_per_k_per_tonne",
    ]);
  });

  it("ships the tier 0–2 building set, resources, encyclopedia, and map", () => {
    const pack = loadBasePack();
    expect(pack.buildings.map((b) => b.id)).toEqual([
      "battery-bank",
      "clinic",
      "comms-tower",
      "eclss-core",
      "exercise-module",
      "fission-surface-power",
      "foundation-habitat",
      "radiator-wing",
      "regen-fuel-cell",
      "rtg-keepalive",
      "sabatier-unit",
      "solar-array-10kw",
      "storm-shelter",
      "water-gas-storage",
    ]);
    expect(pack.building("fission-surface-power").powerKw).toBe(40);
    expect(pack.building("battery-bank").storageKwh).toBe(200);
    expect(pack.building("regen-fuel-cell").storageRoundTripEff).toBe(0.55);
    expect(pack.building("foundation-habitat").services.housing).toBe(4);
    expect(pack.building("storm-shelter").shieldingGcm2).toBe(10);
    expect(pack.building("eclss-core").eclss?.scrubberKgCo2Day).toBe(8);
    expect(pack.resource("machine-components").importCostPerKg).toBe(100000);
    expect(pack.resource("food").id).toBe("food");
    expect(pack.encyclopedia.length).toBeGreaterThanOrEqual(23);
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
