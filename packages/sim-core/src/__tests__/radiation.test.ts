import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_PLACE_BUILDING,
  CMD_TRIGGER_SPE,
  createGameDef,
} from "../game/game-def.js";
import { CREW_COMPONENT, type CrewComponent } from "../game/components.js";
import { shieldingFactor } from "../systems/radiation.js";
import { R_FOOD, R_O2, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const HAB = 4; // first placed building
const SHELTER = 5;
const CREW1 = 9; // after hab, shelter, fission, radiator, eclss

function makeWorld(): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 7 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: 0, y: 0 }); // 4, shield 5
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "shelter", x: 2, y: 0 }); // 5, shield 10
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 3, y: 2 }); // 6
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 0, y: 2 }); // 7
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "eclss", x: 5, y: 2 }); // 8 — scrubber/OGA
  world.enqueueCommand(CMD_ADD_CREW, { name: "Ada", skills: {}, location: HAB }); // 9
  world.resources.add(HAB, R_O2, 500, "initial-stock");
  world.resources.add(HAB, R_WATER, 5000, "initial-stock");
  world.resources.add(HAB, R_FOOD, 500, "initial-stock");
  return world;
}

function ada(world: World): CrewComponent {
  return world.store<CrewComponent>(CREW_COMPONENT).require(CREW1);
}

function rolling30d(crew: CrewComponent): number {
  return crew.dose30d.reduce((sum, d) => sum + d, 0);
}

describe("shieldingFactor", () => {
  const curve: [number, number][] = [
    [0, 1.0],
    [10, 0.7],
    [50, 0.5],
    [75, 0.6],
    [300, 0.35],
  ];

  it("interpolates between anchors and clamps at the ends", () => {
    expect(shieldingFactor(curve, 0)).toBe(1.0);
    expect(shieldingFactor(curve, 5)).toBeCloseTo(0.85, 9);
    expect(shieldingFactor(curve, 10)).toBeCloseTo(0.7, 9);
    expect(shieldingFactor(curve, 400)).toBe(0.35);
  });

  it("models the secondary-neutron bump (more shielding can be worse)", () => {
    expect(shieldingFactor(curve, 75)).toBeGreaterThan(shieldingFactor(curve, 50));
  });
});

describe("RadiationSystem", () => {
  it("accumulates chronic dose scaled by building shielding", () => {
    const world = makeWorld();
    world.run(24 * 10);
    const crew = ada(world);
    // 0.5 mSv/day × S(5 g/cm²) × 10 days; curve gives S(5) = 0.825 → 4.125.
    expect(crew.doseCareerMSv).toBeGreaterThan(3.9);
    expect(crew.doseCareerMSv).toBeLessThan(4.35);
    expect(rolling30d(crew)).toBeCloseTo(crew.doseCareerMSv, 6);
  });

  it("EVA crew take the full unshielded rate", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ASSIGN_CREW, { crew: CREW1, eva: 1 });
    world.run(24 * 10);
    expect(ada(world).doseCareerMSv).toBeCloseTo(5, 1); // 0.5 × 10 unshielded
  });

  it("the 30-day window forgets doses older than 30 days", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 100 }, 0);
    world.run(24 * 5);
    // In the hab (5 g/cm²): SPE factor ≈ 0.43 → ~43 mSv + chronic.
    const afterSpe = rolling30d(ada(world));
    expect(afterSpe).toBeGreaterThan(40);
    world.run(24 * 31); // the SPE day leaves the window
    const later = ada(world);
    expect(rolling30d(later)).toBeLessThan(20); // chronic only (~12.4)
    expect(later.doseCareerMSv).toBeGreaterThan(55); // career never forgets
  });

  it("exceeding the 30-day limit applies radiation sickness; recovery clears it", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ASSIGN_CREW, { crew: CREW1, eva: 1 }, 0);
    world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 300 }, 1); // full 300 on EVA
    world.enqueueCommand(CMD_ASSIGN_CREW, { crew: CREW1, eva: 0 }, 2);
    world.run(24 * 3);
    const crew = ada(world);
    expect(rolling30d(crew)).toBeGreaterThan(250);
    expect(crew.radiationSick).toBe(1);
    expect(crew.health).toBeLessThan(100); // proportional sickness damage
    world.run(24 * 32);
    const recovered = ada(world);
    expect(recovered.radiationSick).toBe(0);
    expect(recovered.alive).toBe(1); // a 300 mSv event sickens, not kills
  });

  it("SPE: shelter ≥10 g/cm² caps the dose at ≤10 mSv; hab shielding halves-ish it; EVA takes all", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ADD_CREW, { name: "Ben", skills: {}, location: HAB });
    world.enqueueCommand(CMD_ADD_CREW, { name: "Cleo", skills: {}, location: HAB });
    world.tick();
    const crews = world.store<CrewComponent>(CREW_COMPONENT);
    // Ada → shelter, Ben EVA, Cleo stays in the hab (5 g/cm²).
    world.enqueueCommand(CMD_ASSIGN_CREW, { crew: CREW1, location: SHELTER });
    world.enqueueCommand(CMD_ASSIGN_CREW, { crew: CREW1 + 1, eva: 1 });
    world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 500 }, world.tickCount + 1);
    world.run(2);
    const byName = new Map([...crews.entries()].map(([, c]) => [c.name, c]));
    const dose = (name: string): number => rolling30d(byName.get(name) as CrewComponent);
    expect(dose("Ada")).toBeLessThanOrEqual(10 + 1); // sheltered (+chronic)
    expect(dose("Ben")).toBeGreaterThan(490); // EVA: full 500
    expect(dose("Cleo")).toBeGreaterThan(180); // 5 g/cm²: between min and safe
    expect(dose("Cleo")).toBeLessThan(250); // under the 30-day limit (SDD intent)
  });
});
