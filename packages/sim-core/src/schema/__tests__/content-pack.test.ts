import { describe, expect, it } from "vitest";
import { ContentPackError, loadContentPack, mergePacks } from "../content-pack.js";

const AS_OF = "2026-06";

const water = {
  id: "water",
  name: "Water",
  phase: 2,
  storageClass: "bulk",
  densityKgM3: 1000,
  boiloffPerDay: 0,
  importCostPerKg: 250000,
  source: "std",
  as_of: AS_OF,
};

const o2gas = { ...water, id: "o2-gas", name: "Oxygen (gas)", storageClass: "pressurized" };
const h2gas = { ...water, id: "h2-gas", name: "Hydrogen (gas)", storageClass: "pressurized" };

const electrolyzer = {
  id: "electrolyzer",
  name: "Electrolyzer",
  tier: 2,
  phase: 2,
  analogue: "ISS OGA-class PEM stack",
  source: "std",
  as_of: AS_OF,
  massKg: 500,
  footprint: [1, 1],
  powerKw: -10,
  heatKw: 1.2,
  priorityTier: 2,
  buildCost: { imported: [{ resource: "water", kg: 1 }], local: [] },
  placement: { terrain: ["highland"], maxSlope: 5, requiresPSR: false },
  reactions: ["electrolysis"],
  techRequired: null,
};

const electrolysis = {
  id: "electrolysis",
  name: "Water Electrolysis",
  building: "electrolyzer",
  inputs: [{ resource: "water", kg: 1.0 }],
  outputs: [
    { resource: "o2-gas", kg: 0.89 },
    { resource: "h2-gas", kg: 0.11 },
  ],
  energyKwhPerKgPrimary: 5.0,
  primaryOutput: "o2-gas",
  heatKw: 1.2,
  source: "PEM stack typical",
  as_of: AS_OF,
};

const validDocs = {
  resources: [water, o2gas, h2gas],
  buildings: [electrolyzer],
  reactions: [electrolysis],
};

describe("loadContentPack", () => {
  it("loads a valid pack with sorted content and working lookups", () => {
    const pack = loadContentPack("test", validDocs);
    expect(pack.resources.map((r) => r.id)).toEqual(["h2-gas", "o2-gas", "water"]);
    expect(pack.reaction("electrolysis").primaryOutput).toBe("o2-gas");
    expect(pack.building("electrolyzer").powerKw).toBe(-10);
    expect(() => pack.resource("helium-3")).toThrow(/no resources entry/);
  });

  it("treats missing categories as empty", () => {
    const pack = loadContentPack("empty", {});
    expect(pack.constants).toEqual([]);
    expect(pack.events).toEqual([]);
  });

  it("rejects reactions that violate mass balance", () => {
    const broken = {
      ...validDocs,
      reactions: [
        { ...electrolysis, outputs: [{ resource: "o2-gas", kg: 0.95 }] }, // 1.0 in, 0.95 out
      ],
    };
    expect(() => loadContentPack("test", broken)).toThrow(/mass balance/);
  });

  it("accounts vented loss in mass balance", () => {
    const vented = {
      ...validDocs,
      reactions: [
        { ...electrolysis, outputs: [{ resource: "o2-gas", kg: 0.95 }], ventedLossKg: 0.05 },
      ],
    };
    expect(() => loadContentPack("test", vented)).not.toThrow();
  });

  it("rejects a primaryOutput that is not an output", () => {
    const broken = {
      ...validDocs,
      reactions: [{ ...electrolysis, primaryOutput: "water" }],
    };
    expect(() => loadContentPack("test", broken)).toThrow(/primaryOutput/);
  });

  it("rejects duplicate ids across categories", () => {
    const broken = {
      ...validDocs,
      buildings: [{ ...electrolyzer, id: "water", reactions: [] }],
      reactions: [],
    };
    expect(() => loadContentPack("test", broken)).toThrow(/duplicate id 'water'/);
  });

  it("rejects dangling references", () => {
    expect(() => loadContentPack("test", { reactions: [electrolysis] })).toThrow(ContentPackError);
    try {
      loadContentPack("test", { reactions: [electrolysis] });
    } catch (error) {
      const issues = (error as ContentPackError).issues.join("\n");
      expect(issues).toMatch(/missing building 'electrolyzer'/);
      expect(issues).toMatch(/missing resource 'water'/);
    }
  });

  it("rejects unknown keys (typo protection)", () => {
    const typo = { ...water, densityKgM: 1000 };
    expect(() => loadContentPack("test", { resources: [typo] })).toThrow(ContentPackError);
  });

  it("enforces sourced-needs-source on constants but allows needs_source placeholders", () => {
    const sourced = {
      id: "crew_o2_day",
      value: 0.84,
      unit: "kg/person/day",
      source: "",
      as_of: AS_OF,
      status: "sourced",
    };
    expect(() => loadContentPack("test", { constants: [sourced] })).toThrow(/empty source/);
    const placeholder = { ...sourced, id: "tbd_value", status: "needs_source" };
    expect(() => loadContentPack("test", { constants: [placeholder] })).not.toThrow();
  });

  it("exposes scalar constants via number() and rejects composite access", () => {
    const pack = loadContentPack("test", {
      constants: [
        { id: "g", value: 1.62, unit: "m/s2", source: "std", as_of: AS_OF },
        { id: "plant", value: { massKg: 400 }, unit: "composite", source: "std", as_of: AS_OF },
      ],
    });
    expect(pack.number("g")).toBe(1.62);
    expect(() => pack.number("plant")).toThrow(/composite/);
  });

  it("detects tech prerequisite cycles", () => {
    const tech = (id: string, prereqs: string[]) => ({
      id,
      branch: "x",
      phase: 2,
      trl2026: 5,
      costScience: 10,
      prereqs,
      unlocks: { buildings: [], modifiers: [] },
      source: "std",
      as_of: AS_OF,
    });
    const cyclic = { tech: [tech("a", ["b"]), tech("b", ["c"]), tech("c", ["a"])] };
    expect(() => loadContentPack("test", cyclic)).toThrow(/cycle/);
    const dag = { tech: [tech("a", ["b", "c?"]), tech("b", ["c"]), tech("c", [])] };
    expect(() => loadContentPack("test", dag)).not.toThrow();
  });

  it("rejects tech unlocking a building of an earlier phase", () => {
    const docs = {
      ...validDocs,
      buildings: [{ ...electrolyzer, phase: 1, reactions: [], techRequired: "adv" }],
      reactions: [],
      tech: [
        {
          id: "adv",
          branch: "x",
          phase: 3,
          trl2026: 4,
          costScience: 100,
          prereqs: [],
          unlocks: { buildings: ["electrolyzer"], modifiers: [] },
          source: "std",
          as_of: AS_OF,
        },
      ],
    };
    expect(() => loadContentPack("test", docs)).toThrow(/earlier phase/);
  });
});

describe("mergePacks", () => {
  it("appends new ids and applies override replacements", () => {
    const base = loadContentPack("base", validDocs);
    const mod = loadContentPack("mod", {
      resources: [
        { ...water, id: "regolith", name: "Regolith", storageClass: "bulk" },
        { ...water, name: "Water (filtered)", override: true },
      ],
    });
    const merged = mergePacks(base, mod);
    expect(merged.id).toBe("base+mod");
    expect(merged.resources.map((r) => r.id)).toEqual(["h2-gas", "o2-gas", "regolith", "water"]);
    expect(merged.resource("water").name).toBe("Water (filtered)");
  });

  it("rejects duplicate ids without override", () => {
    const base = loadContentPack("base", validDocs);
    const mod = loadContentPack("mod", {
      resources: [{ ...water, name: "Conflicting Water" }],
    });
    expect(() => mergePacks(base, mod)).toThrow(/without override/);
  });

  it("loads mod packs with dangling base refs only in partial mode", () => {
    const modDocs = {
      buildings: [{ ...electrolyzer, id: "mre-plant", reactions: ["mre"], techRequired: null }],
    };
    expect(() => loadContentPack("mod", modDocs)).toThrow(/missing reaction 'mre'/);
    expect(() => loadContentPack("mod", modDocs, { partial: true })).not.toThrow();
  });

  it("re-validates referential integrity after merge", () => {
    const base = loadContentPack("base", validDocs);
    const mod = loadContentPack(
      "mod",
      {
        buildings: [{ ...electrolyzer, id: "mre-plant", reactions: ["mre"], techRequired: null }],
      },
      { partial: true },
    );
    expect(() => mergePacks(base, mod)).toThrow(/missing reaction 'mre'/);
  });
});
