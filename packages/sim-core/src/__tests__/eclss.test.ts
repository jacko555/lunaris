import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import { CMD_ADD_CREW, CMD_PLACE_BUILDING, createGameDef } from "../game/game-def.js";
import { CREW_COMPONENT, type CrewComponent } from "../game/components.js";
import { colonyAmount } from "../game/pool.js";
import { R_CH4, R_CO2, R_FOOD, R_H2, R_O2, R_WASTEWATER, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

/**
 * ECLSS rates per docs/SDD.md §6 on the fixture pack. The standard rig:
 * fission + radiator keep everything powered; entity 4 is the hab.
 */
const HAB = 4;

function makeWorld(buildings: string[] = []): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 1 });
  let x = 0;
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: (x += 0), y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: (x += 2), y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: (x += 2), y: 0 });
  for (const defId of buildings) {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: (x += 1), y: 2 });
  }
  return world;
}

function addCrew(world: World, count: number): void {
  for (let i = 0; i < count; i++) {
    world.enqueueCommand(CMD_ADD_CREW, {
      name: `Crew-${i + 1}`,
      skills: { engineer: 2 },
      location: HAB,
    });
  }
}

function seed(world: World, resource: string, kg: number): void {
  world.resources.add(HAB, resource, kg, "initial-stock");
}

function crewList(world: World): CrewComponent[] {
  return [...world.store<CrewComponent>(CREW_COMPONENT).entries()].map(([, c]) => c);
}

describe("EclssSystem", () => {
  it("consumes NASA ALS rates and exhales CO₂", () => {
    const world = makeWorld();
    addCrew(world, 4);
    seed(world, R_O2, 100);
    seed(world, R_WATER, 1000);
    seed(world, R_FOOD, 100);
    world.run(24); // one day
    // 4 crew × (0.84 O₂ / 3.54+3.5 water / 0.62 food) per day.
    expect(100 - colonyAmount(world, R_O2)).toBeCloseTo(4 * 0.84, 3);
    expect(100 - colonyAmount(world, R_FOOD)).toBeCloseTo(4 * 0.62, 3);
    expect(1000 - colonyAmount(world, R_WATER)).toBeCloseTo(4 * (3.54 + 3.5), 3);
    expect(colonyAmount(world, R_CO2)).toBeCloseTo(4 * 1.0, 3);
    expect(colonyAmount(world, R_WASTEWATER)).toBeGreaterThan(0);
    for (const crew of crewList(world)) {
      expect(crew.hungerHours).toBe(0);
      expect(crew.hypoxiaHours).toBe(0);
    }
  });

  it("water recycling recovers the closure fraction (93%)", () => {
    const world = makeWorld(["eclss"]);
    addCrew(world, 4);
    seed(world, R_O2, 200);
    seed(world, R_WATER, 200);
    seed(world, R_FOOD, 100);
    world.run(24 * 10);
    // Net water loss/day ≈ gross draw × (1 − recovery) ≈ 28.16 × 0.07 ≈ 2 kg
    // (plus OGA electrolysis draw). Without recycling it would be ~28 kg/day.
    const lost = 200 - colonyAmount(world, R_WATER);
    const grossTenDays = 4 * (3.54 + 3.5) * 10;
    expect(lost).toBeLessThan(grossTenDays * 0.35);
    expect(colonyAmount(world, R_WASTEWATER)).toBeLessThan(10); // recycler keeps up
  });

  it("the OGA electrolyzes water into O₂ toward the reserve target", () => {
    const world = makeWorld(["eclss"]);
    addCrew(world, 4);
    seed(world, R_WATER, 500);
    seed(world, R_FOOD, 50);
    seed(world, R_O2, 2); // nearly empty — OGA must keep up from water
    world.run(24 * 5);
    for (const crew of crewList(world)) {
      expect(crew.alive).toBe(1);
      expect(crew.hypoxiaHours).toBe(0);
    }
    expect(colonyAmount(world, R_H2)).toBeGreaterThan(0); // electrolysis byproduct
  });

  it("scrubber keeps cabin CO₂ below the danger threshold", () => {
    const world = makeWorld(["eclss"]);
    addCrew(world, 4);
    seed(world, R_O2, 200);
    seed(world, R_WATER, 500);
    seed(world, R_FOOD, 100);
    world.run(24 * 5);
    for (const crew of crewList(world)) {
      expect(crew.co2Hours).toBe(0);
    }
  });

  it("without a scrubber, CO₂ builds up and the danger accumulator engages", () => {
    const world = makeWorld(); // no eclss
    addCrew(world, 4);
    seed(world, R_O2, 200);
    seed(world, R_WATER, 500);
    seed(world, R_FOOD, 100);
    world.run(36); // 1 kg/person reached at ~24 h
    const crews = crewList(world);
    expect(crews.some((c) => c.co2Hours > 0)).toBe(true);
  });

  it("Sabatier converts CO₂ + H₂ into CH₄ + water with exact mass balance", () => {
    const world = makeWorld(["eclss", "sabatier"]);
    addCrew(world, 4);
    seed(world, R_O2, 200);
    seed(world, R_WATER, 300);
    seed(world, R_FOOD, 100);
    seed(world, R_H2, 20);
    world.run(24 * 3);
    expect(colonyAmount(world, R_CH4)).toBeGreaterThan(0);
    // Conservation is enforced globally every tick by the ledger; reaching
    // here without a ConservationError proves the 44:8 → 16:36 split.
  });

  it("shortage accumulators reset when supply resumes", () => {
    const world = makeWorld();
    addCrew(world, 2);
    seed(world, R_O2, 100);
    seed(world, R_WATER, 200);
    // No food at all → hunger accumulates.
    world.run(48);
    expect(crewList(world).every((c) => c.hungerHours >= 47)).toBe(true);
    world.resources.add(HAB, R_FOOD, 50, "initial-stock");
    world.run(2);
    expect(crewList(world).every((c) => c.hungerHours === 0)).toBe(true);
  });
});
