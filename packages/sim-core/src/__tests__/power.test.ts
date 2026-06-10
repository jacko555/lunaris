import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import { CMD_PLACE_BUILDING, createGameDef, GRID_ENTITY } from "../game/game-def.js";
import {
  BUILDING_COMPONENT,
  GRID_COMPONENT,
  STORAGE_COMPONENT,
  type BuildingComponent,
  type GridComponent,
  type StorageComponent,
} from "../game/components.js";
import { energyImbalanceKw } from "../systems/power.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

/**
 * PowerSystem tests on the 8×8 fixture map (column 6 = class A, column 7 =
 * PSR, the rest class B with day from tick 0 to ~354).
 */
function makeWorld(): World {
  return createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 1 });
}

function place(world: World, defId: string, x: number, y: number): void {
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x, y });
}

function grid(world: World): GridComponent {
  return world.store<GridComponent>(GRID_COMPONENT).require(GRID_ENTITY);
}

function buildingOn(world: World, defId: string): BuildingComponent {
  const store = world.store<BuildingComponent>(BUILDING_COMPONENT);
  for (const [, building] of store.entries()) {
    if (building.defId === defId) {
      return building;
    }
  }
  throw new Error(`No '${defId}' placed`);
}

describe("PowerSystem", () => {
  it("solar output follows tile illumination; fission is flat", () => {
    const world = makeWorld();
    place(world, "solar", 0, 0); // class B
    place(world, "fission", 2, 0);
    place(world, "radiator", 4, 0); // keeps the reactor out of overheat damage
    world.tick();
    expect(grid(world).generationKw).toBeCloseTo(50, 6); // 10 lit + 40
    world.run(400); // into class-B night
    expect(grid(world).generationKw).toBeCloseTo(40, 6); // fission only
  });

  it("class-A solar keeps producing into the night until the eclipse window", () => {
    const world = makeWorld();
    place(world, "solar", 6, 0); // class A ridge
    world.run(360); // class-B night, before phase 0.70
    expect(grid(world).generationKw).toBeCloseTo(10, 6);
    world.run(180); // phase ~0.76 — inside the clustered eclipse
    expect(grid(world).generationKw).toBeCloseTo(0, 6);
  });

  it("sheds priority tiers bottom-up under deficit", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0); // 6 kW tier 0
    place(world, "lab", 2, 0); // 5 kW tier 2
    place(world, "industry", 3, 0); // 10 kW tier 3
    place(world, "solar", 4, 0); // 10 kW by day
    world.tick();
    const g = grid(world);
    // 10 kW gen vs 21 kW demand: tier 0 full, tier 2 partial, tier 3 dark.
    expect(g.tierFraction[0]).toBe(1);
    expect(g.tierFraction[2]).toBeCloseTo(4 / 5, 6);
    expect(g.tierFraction[3]).toBe(0);
    expect(buildingOn(world, "hab").poweredFraction).toBe(1);
    expect(buildingOn(world, "industry").poweredFraction).toBe(0);
    expect(g.brownout).toBe(1);
  });

  it("charges storage with surplus at round-trip efficiency and discharges at night", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0); // 6 kW tier 0
    place(world, "solar", 2, 0);
    place(world, "solar", 3, 0); // 20 kW day
    place(world, "battery", 4, 0); // 200 kWh, starts full
    const storage = (): StorageComponent =>
      world
        .store<StorageComponent>(STORAGE_COMPONENT)
        .require(world.store<BuildingComponent>(BUILDING_COMPONENT).entities()[3] as number);
    world.tick(); // placements apply, battery full
    expect(storage().energyKwh).toBe(200);

    world.run(359); // t=360: a few hours into the night
    expect(grid(world).dischargeKw).toBeGreaterThan(0);
    const earlyNightKwh = storage().energyKwh;
    expect(earlyNightKwh).toBeLessThan(200);

    world.run(194); // t=554: deep night, battery exhausted by the 6 kW hab load
    const deepNightKwh = storage().energyKwh;
    expect(deepNightKwh).toBeLessThan(earlyNightKwh);

    world.run(160); // t=714: into day 2, 20 kW gen vs hab load → surplus
    const before = storage().energyKwh;
    world.tick();
    const g = grid(world);
    expect(g.chargeKw).toBeGreaterThan(0);
    // Round-trip efficiency applies at charge: stored delta = input × 0.9.
    expect(storage().energyKwh - before).toBeCloseTo(g.chargeKw * 0.9, 6);
    expect(storage().energyKwh).toBeGreaterThan(deepNightKwh);
  });

  it("balances the energy books every tick across a full lunar cycle", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0);
    place(world, "solar", 2, 0);
    place(world, "battery", 3, 0);
    place(world, "fission", 4, 0);
    place(world, "industry", 4, 3);
    for (let t = 0; t < 709; t++) {
      world.tick();
      expect(Math.abs(energyImbalanceKw(world, GRID_ENTITY))).toBeLessThan(1e-9);
    }
  });

  it("raises a brownout alert on the shed edge and clears it on recovery", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0);
    place(world, "solar", 2, 0);
    place(world, "solar", 3, 0); // 20 kW day, 0 at night — no storage
    let sawBrownout = false;
    let sawRestored = false;
    for (let t = 0; t < 760; t++) {
      world.tick();
      const alerts = world
        .store<{ entries: { code: string }[]; seq: number }>("alerts")
        .require(3).entries;
      sawBrownout ||= alerts.some((a) => a.code === "brownout");
      sawRestored ||= alerts.some((a) => a.code === "power-restored");
    }
    expect(sawBrownout).toBe(true);
    expect(sawRestored).toBe(true); // sunrise recovers the grid
  });
});
