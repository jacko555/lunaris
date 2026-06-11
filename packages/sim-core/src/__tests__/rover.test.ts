import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_LAUNCH_EXPEDITION,
  CMD_ORDER_ROVER,
  CMD_PLACE_BUILDING,
  COLONY_ENTITY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  ECONOMY_COMPONENT,
  RESEARCH_COMPONENT,
  ROVER_COMPONENT,
  type AlertsComponent,
  type EconomyComponent,
  type PhaseComponent,
  type ResearchComponent,
  type RoverComponent,
} from "../game/components.js";
import { colonyAmount } from "../game/pool.js";
import { R_WATER_ICE } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const PACK = makeTestPack();

function makeWorld(config: Record<string, unknown> = {}): World {
  const world = createWorld(createGameDef(PACK, makeTestMap()), {
    seed: 11,
    config: { startBudgetUsd: 10e9, failureTables: "ideal", startPhase: 0, ...config } as never,
  });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 0, y: 2 });
  return world;
}

function rovers(world: World): [number, RoverComponent][] {
  return [...world.store<RoverComponent>(ROVER_COMPONENT).entries()];
}

describe("RoverSystem (M-Rover)", () => {
  it("orders a rover, charges the budget, and parks it at the base", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ORDER_ROVER, { kind: "prospector" });
    world.run(2);
    const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
    expect(economy.balanceUsd).toBe(10e9 - 250e6);
    const [[, rover]] = rovers(world) as [[number, RoverComponent]];
    expect(rover.state).toBe(0);
    expect(rover.x).toBe(0); // home = first building (fission at 0,0)
  });

  it("surveys an icy PSR tile and returns science + an ice core", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ORDER_ROVER, { kind: "prospector" });
    world.run(2);
    const [[id]] = rovers(world) as [[number, RoverComponent]];
    // Test map: column 7 is PSR with iceFrac 0.056.
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: id, x: 7, y: 0 });
    const scienceBefore = world
      .store<ResearchComponent>(RESEARCH_COMPONENT)
      .require(COLONY_ENTITY).sciencePoints;
    // 7 tiles ≈ 1.75 km at 2 km/h ⇒ ~1 h out, 4 h survey, ~1 h back.
    world.run(24);
    const [[, rover]] = rovers(world) as [[number, RoverComponent]];
    expect(rover.state).toBe(0); // home again
    expect(rover.surveysDone).toBe(1);
    const science = world
      .store<ResearchComponent>(RESEARCH_COMPONENT)
      .require(COLONY_ENTITY).sciencePoints;
    expect(science - scienceBefore).toBeCloseTo(50, 5); // ice ground truth pays double
    expect(colonyAmount(world, R_WATER_ICE)).toBeGreaterThan(15); // 20 kg × 0.056/0.056
    const phase = world.store<PhaseComponent>("phase").require(COLONY_ENTITY);
    expect(phase.iceCharacterized).toBe(1);
  });

  it("strands a rover that out-drives its battery", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ORDER_ROVER, { kind: "scout" }); // 0.5 kWh fixture
    world.run(2);
    const [[id]] = rovers(world) as [[number, RoverComponent]];
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: id, x: 7, y: 7 });
    world.run(12);
    const [[, rover]] = rovers(world) as [[number, RoverComponent]];
    expect(rover.state).toBe(4);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.some((a) => a.code === "rover-stranded")).toBe(true);
  });

  it("rejects expeditions from busy or unknown rovers", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_ORDER_ROVER, { kind: "prospector" });
    world.run(2);
    const [[id]] = rovers(world) as [[number, RoverComponent]];
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: id, x: 7, y: 7 });
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: id, x: 3, y: 3 }); // busy
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: 999, x: 3, y: 3 }); // unknown
    world.run(2);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.filter((a) => a.code === "expedition-rejected")).toHaveLength(2);
  });

  it("realistic failure tables damage the rover during the survey (fixture p=1)", () => {
    const world = makeWorld({ failureTables: "realistic" });
    world.enqueueCommand(CMD_ORDER_ROVER, { kind: "prospector" });
    world.run(2);
    const [[id]] = rovers(world) as [[number, RoverComponent]];
    world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: id, x: 7, y: 0 });
    world.run(24);
    const [[, rover]] = rovers(world) as [[number, RoverComponent]];
    expect(rover.condition).toBeLessThanOrEqual(0.5);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.some((a) => a.code === "rover-damage")).toBe(true);
  });

  it("the policy AI prospects the deposit with a rover (observer mode)", () => {
    const world = makeWorld({ policyEnabled: 1, startPhase: 0 });
    world.run(24 * 40);
    const fleet = rovers(world);
    expect(fleet.length).toBeGreaterThanOrEqual(1);
    expect((fleet[0] as [number, RoverComponent])[1].surveysDone).toBeGreaterThanOrEqual(1);
    const phase = world.store<PhaseComponent>("phase").require(COLONY_ENTITY);
    expect(phase.iceCharacterized).toBe(1);
  });

  it("hazard impact alerts chain back to their forecast warning (T12)", () => {
    const world = makeWorld({ startPhase: 2, failureTables: "realistic" });
    world.tick();
    const pendingEntity = world.createEntity();
    world.store("pending-hazard").set(pendingEntity, {
      eventId: "spe-major",
      impactTick: world.tickCount + 2,
      warnSeq: 41,
    } as never);
    world.run(4);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    const hit = alerts.find((a) => a.code === "spe-hit");
    expect(hit?.causedBy).toBe(41);
  });
});
