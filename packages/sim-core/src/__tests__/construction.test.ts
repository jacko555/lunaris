import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_ADD_CREW,
  CMD_PLACE_BUILDING,
  CMD_QUEUE_BUILD,
  CMD_TRIGGER_SPE,
  createGameDef,
} from "../game/game-def.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  SITE_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type SiteComponent,
} from "../game/components.js";
import { adjacentBermShielding } from "../systems/construction.js";
import { R_PRINTED, R_REGOLITH } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const PACK = makeTestPack();

function makeWorld(config: Record<string, unknown> = {}): World {
  const world = createWorld(createGameDef(PACK, makeTestMap()), {
    seed: 9,
    config: config as never,
  });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
  return world;
}

function buildingsOf(world: World, defId: string): BuildingComponent[] {
  return [...world.store<BuildingComponent>(BUILDING_COMPONENT).entries()]
    .map(([, b]) => b)
    .filter((b) => b.defId === defId);
}

describe("ConstructionSystem", () => {
  it("queued builds take construction_hours_per_tonne and then instantiate", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_QUEUE_BUILD, { defId: "battery", x: 4, y: 0 }); // 1 t → 8 h
    world.tick();
    expect(world.store<SiteComponent>(SITE_COMPONENT).size).toBe(1);
    expect(buildingsOf(world, "battery")).toHaveLength(0);
    world.run(8);
    expect(world.store<SiteComponent>(SITE_COMPONENT).size).toBe(0);
    expect(buildingsOf(world, "battery")).toHaveLength(1);
  });

  it("waits for materials, then prefers the local recipe (make-vs-buy)", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_QUEUE_BUILD, { defId: "pad", x: 4, y: 2 }); // local: 5 t printed
    world.run(60); // 5 t × 8 h = 40 h — but unpaid, so no progress
    expect(world.store<SiteComponent>(SITE_COMPONENT).size).toBe(1);
    expect(buildingsOf(world, "pad")).toHaveLength(0);

    world.resources.add(4, R_PRINTED, 6000, "initial-stock");
    world.run(42);
    expect(buildingsOf(world, "pad")).toHaveLength(1);
    // Local recipe consumed the printed structure.
    expect(world.resources.amount(4, R_PRINTED)).toBeCloseTo(1000, 6);
  });

  it("placement validation rejects bad tiles and tech-locked buildings", () => {
    const world = makeWorld();
    // Slope row y=7 is 20°, battery max 31 — use harvester PSR rule instead:
    world.enqueueCommand(CMD_QUEUE_BUILD, { defId: "harvester", x: 0, y: 4 }); // not PSR
    world.enqueueCommand(CMD_QUEUE_BUILD, { defId: "gated", x: 4, y: 4 }); // tech-locked
    world.run(2);
    expect(world.store<SiteComponent>(SITE_COMPONENT).size).toBe(0);

    const unlocked = makeWorld({ startTechs: ["t_basic", "t_adv"] });
    unlocked.enqueueCommand(CMD_QUEUE_BUILD, { defId: "gated", x: 4, y: 4 });
    unlocked.run(2);
    expect(unlocked.store<SiteComponent>(SITE_COMPONENT).size).toBe(1);
  });

  it("berms add their areal density to adjacent buildings (SPE counterplay)", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: 4, y: 4 }); // 1×1, shield 5
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "berm", x: 3, y: 4 }); // +6 adjacent
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "berm", x: 5, y: 4 }); // +6 adjacent
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "eclss", x: 0, y: 4 });
    world.enqueueCommand(CMD_ADD_CREW, { name: "Ada", skills: {}, location: 6 });
    world.resources.add(6, "o2-gas", 200, "initial-stock");
    world.resources.add(6, "water", 1000, "initial-stock");
    world.resources.add(6, "food", 100, "initial-stock");
    world.tick();

    const hab = buildingsOf(world, "hab")[0] as BuildingComponent;
    expect(adjacentBermShielding(world, PACK, hab)).toBe(12);

    // 5 + 12 = 17 g/cm² ≥ spe_shelter_safe → SPE capped at ≤10 mSv.
    world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 500 });
    world.run(2);
    const crews = world.store<CrewComponent>(CREW_COMPONENT);
    const ada = [...crews.entries()][0]?.[1] as CrewComponent;
    expect(ada.dose30d.reduce((s, d) => s + d, 0)).toBeLessThanOrEqual(10.1);
  });

  it("printed-regolith recipes are the import-mass discount", () => {
    // A berm costs 20 t of free ground regolith instead of any import.
    const world = makeWorld();
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "printer", x: 4, y: 0 });
    world.run(24 * 7); // printer feeds on ground regolith → printed structure
    expect(colonyAmountOf(world, R_PRINTED)).toBeGreaterThan(900);
    expect(colonyAmountOf(world, R_REGOLITH)).toBe(0); // consumed as it is scooped
  });
});

function colonyAmountOf(world: World, resource: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let total = 0;
  for (const entity of buildings.entities()) {
    total += world.resources.amount(entity, resource);
  }
  return total;
}
