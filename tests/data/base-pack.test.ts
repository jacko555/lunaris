import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentPack, type ContentPackDocuments } from "@lunaris/sim-core";

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
  };
  return loadContentPack("base", documents);
}

describe("data/base content pack", () => {
  it("validates against the DATA-SCHEMA zod schemas", () => {
    expect(() => loadBasePack()).not.toThrow();
  });

  it("carries the full SDD §1 constants table", () => {
    const pack = loadBasePack();
    // SDD master table minus micrometeorite_flux (site-dependent, lives in
    // the EVENTS hazard tables).
    expect(pack.constants.length).toBe(45);
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

  it("flags only known-speculative constants as speculative", () => {
    const pack = loadBasePack();
    const speculative = pack.constants.filter((c) => c.status === "speculative").map((c) => c.id);
    expect(speculative).toEqual(["cost_per_kg_surface"]);
    const unsourced = pack.constants.filter((c) => c.status === "needs_source");
    expect(unsourced).toEqual([]);
  });
});
