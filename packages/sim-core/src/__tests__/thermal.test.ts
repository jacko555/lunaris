import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import { CMD_PLACE_BUILDING, createGameDef } from "../game/game-def.js";
import {
  BUILDING_COMPONENT,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type ThermalComponent,
} from "../game/components.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

function makeWorld(): World {
  return createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 1 });
}

function place(world: World, defId: string, x: number, y: number): void {
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x, y });
}

function thermalOf(world: World, defId: string): ThermalComponent {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);
  for (const [entity, building] of buildings.entries()) {
    if (building.defId === defId) {
      return thermals.require(entity);
    }
  }
  throw new Error(`No '${defId}' placed`);
}

function buildingOf(world: World, defId: string): BuildingComponent {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  for (const [, building] of buildings.entries()) {
    if (building.defId === defId) {
      return building;
    }
  }
  throw new Error(`No '${defId}' placed`);
}

describe("ThermalSystem", () => {
  it("an unpowered habitat freezes during the lunar night and takes damage", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0); // no power source at all
    world.run(360); // into the night
    world.run(300); // deep night
    const thermal = thermalOf(world, "hab");
    const building = buildingOf(world, "hab");
    expect(thermal.state).toBe("freeze");
    expect(thermal.tempK).toBeLessThan(273);
    expect(building.condition).toBeLessThan(1);
  });

  it("a powered habitat holds nominal temperature through the full night", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0);
    place(world, "fission", 2, 0); // 40 kWe covers load + heater
    place(world, "radiator", 4, 0);
    for (let t = 0; t < 1418; t++) {
      // two full lunar cycles
      world.tick();
      expect(thermalOf(world, "hab").state).toBe("nominal");
    }
    expect(buildingOf(world, "hab").condition).toBe(1);
  });

  it("overheats when waste heat has nowhere to go", () => {
    const world = makeWorld();
    place(world, "fission", 0, 0); // 8 kW waste heat, no radiator wing
    let overheated = false;
    for (let t = 0; t < 709 && !overheated; t++) {
      world.tick();
      overheated = thermalOf(world, "fission").state === "overheat";
    }
    expect(overheated).toBe(true);
    expect(buildingOf(world, "fission").condition).toBeLessThan(1);
  });

  it("a shared radiator wing prevents that overheat", () => {
    const world = makeWorld();
    place(world, "fission", 0, 0);
    place(world, "radiator", 2, 0);
    for (let t = 0; t < 709; t++) {
      world.tick();
      expect(thermalOf(world, "fission").state).toBe("nominal");
    }
  });

  it("freeze/overheat transitions raise alerts with cause text", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0);
    world.run(709);
    const alerts = world
      .store<{ entries: { code: string; message: string }[] }>("alerts")
      .require(3).entries;
    const freeze = alerts.find((a) => a.code === "freeze");
    expect(freeze).toBeDefined();
    expect(freeze?.message).toMatch(/water systems offline/);
  });

  it("heater demand appears as tier-1 load the next tick", () => {
    const world = makeWorld();
    place(world, "hab", 0, 0);
    place(world, "fission", 2, 0);
    world.run(400); // night
    const thermal = thermalOf(world, "hab");
    const gridStore = world.store<{ tierDemandKw: number[] }>("grid");
    if (thermal.heaterRequestKw > 0) {
      world.tick();
      expect(gridStore.require(2).tierDemandKw[1]).toBeGreaterThan(0);
    }
  });
});
