import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_CANCEL_RESUPPLY,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  RESUPPLY_COMPONENT,
  type AlertsComponent,
  type ResupplyComponent,
} from "../game/components.js";
import { R_FOOD, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const TANK = 4;

function makeWorld(): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 3 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "tank", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "solar", x: 2, y: 0 });
  return world;
}

describe("LogisticsSystem (resupply v0)", () => {
  it("delivers the manifest at the arrival tick with heavy-lift cost", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [
        { resource: R_FOOD, kg: 150 },
        { resource: R_WATER, kg: 350 },
      ],
      arrivalTick: 100,
      targetEntity: TANK,
    });
    world.run(100);
    expect(world.resources.amount(TANK, R_FOOD)).toBe(0); // not yet
    world.tick(); // tick 100 delivers
    expect(world.resources.amount(TANK, R_FOOD)).toBe(150);
    expect(world.resources.amount(TANK, R_WATER)).toBe(350);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    const landed = alerts.find((a) => a.code === "cargo-landed");
    expect(landed?.message).toMatch(/500 kg/);
    expect(landed?.message).toMatch(/\$50\.0M/); // 500 kg × $100k/kg
    // One-shot mission is gone afterward.
    expect(world.store<ResupplyComponent>(RESUPPLY_COMPONENT).size).toBe(0);
  });

  it("repeating missions reschedule themselves every interval", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 10 }],
      arrivalTick: 0,
      repeatTicks: 100,
      targetEntity: TANK,
    });
    world.run(301); // deliveries at ticks 0, 100, 200, 300
    expect(world.resources.amount(TANK, R_FOOD)).toBeCloseTo(40, 6);
    const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
    const [, mission] = [...missions.entries()][0] as [number, ResupplyComponent];
    expect(mission.deliveries).toBe(4);
    expect(mission.arrivalTick).toBe(400);
  });

  it("cancelling a mission stops future deliveries", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 10 }],
      arrivalTick: 0,
      repeatTicks: 50,
      targetEntity: TANK,
    });
    world.run(60); // one delivery at 0, one at 50
    const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
    const missionEntity = missions.entities()[0] as number;
    world.enqueueCommand(CMD_CANCEL_RESUPPLY, { entity: missionEntity });
    world.run(200);
    expect(world.resources.amount(TANK, R_FOOD)).toBeCloseTo(20, 6);
  });

  it("rejects bad manifests with an explanatory alert instead of throwing", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: "unobtainium", kg: 10 }],
      arrivalTick: 10,
      targetEntity: TANK,
    });
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: -5 }],
      arrivalTick: 10,
      targetEntity: TANK,
    });
    world.run(20);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.filter((a) => a.code === "resupply-rejected")).toHaveLength(2);
    expect(world.store<ResupplyComponent>(RESUPPLY_COMPONENT).size).toBe(0);
  });
});
