import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_CANCEL_RESUPPLY,
  CMD_LAUNCH_PROBE,
  CMD_LAUNCH_SORTIE,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  COLONY_ENTITY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  ECONOMY_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  RESUPPLY_COMPONENT,
  type AlertsComponent,
  type EconomyComponent,
  type PhaseComponent,
  type ResearchComponent,
  type ResupplyComponent,
} from "../game/components.js";
import { missionFailureP } from "../systems/logistics.js";
import { R_FOOD, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const TANK = 4;
const TRANSIT = 4 * 24; // all fixture vehicle classes: 4-day transit

function makeWorld(config: Record<string, unknown> = {}): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), {
    seed: 3,
    config: { startBudgetUsd: 1e9, ...config } as never,
  });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "tank", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "solar", x: 2, y: 0 });
  return world;
}

function economy(world: World): EconomyComponent {
  return world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
}

function phase(world: World): PhaseComponent {
  return world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
}

describe("LogisticsSystem v1", () => {
  it("delivers after the vehicle transit time and charges the launch cost", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [
        { resource: R_FOOD, kg: 150 },
        { resource: R_WATER, kg: 350 },
      ],
      arrivalTick: 0, // clamped to launch + transit
      targetEntity: TANK,
      vehicle: "heavy",
    });
    world.tick();
    // Cost charged at scheduling: 500 kg × $100k/kg = $50M.
    expect(economy(world).totalLaunchSpendUsd).toBe(50e6);
    expect(world.resources.amount(TANK, R_FOOD)).toBe(0);
    world.run(TRANSIT);
    expect(world.resources.amount(TANK, R_FOOD)).toBe(150);
    expect(world.resources.amount(TANK, R_WATER)).toBe(350);
  });

  it("rejects payloads over the vehicle cap and unknown vehicles", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 500 }],
      arrivalTick: 0,
      targetEntity: TANK,
      vehicle: "clps", // 100 kg cap
    });
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 10 }],
      arrivalTick: 0,
      targetEntity: TANK,
      vehicle: "warp-drive",
    });
    world.run(2);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.filter((a) => a.code === "mission-rejected")).toHaveLength(2);
    expect(world.store<ResupplyComponent>(RESUPPLY_COMPONENT).size).toBe(0);
  });

  it("Starship-class missions require orbital_refueling research", () => {
    const blocked = makeWorld();
    blocked.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 50000 }],
      arrivalTick: 0,
      targetEntity: TANK,
      vehicle: "starship",
    });
    blocked.run(2);
    expect(blocked.store<ResupplyComponent>(RESUPPLY_COMPONENT).size).toBe(0);

    const unlocked = makeWorld({ startTechs: ["orbital_refueling"] });
    unlocked.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 50000 }],
      arrivalTick: 0,
      targetEntity: TANK,
      vehicle: "starship",
    });
    unlocked.run(2);
    expect(unlocked.store<ResupplyComponent>(RESUPPLY_COMPONENT).size).toBe(1);
    // 50 t × $10k/kg = $500M at the Starship target tier.
    expect(economy(unlocked).totalLaunchSpendUsd).toBe(500e6);
  });

  it("realistic CLPS probes fail ~half the time; precision_landing tames it", () => {
    const runProbes = (config: Record<string, unknown>): number => {
      const world = makeWorld(config);
      for (let i = 0; i < 40; i++) {
        world.enqueueCommand(CMD_LAUNCH_PROBE, { x: 7, y: 0 }, i); // PSR column
      }
      world.run(TRANSIT + 50);
      return phase(world).successfulLandings;
    };
    const realistic = runProbes({ failureTables: "realistic" });
    const withTech = runProbes({
      failureTables: "realistic",
      startTechs: ["precision_landing", "night_landing_nav"],
    });
    const ideal = runProbes({ startTechs: ["night_landing_nav"] });
    expect(realistic).toBeGreaterThan(8);
    expect(realistic).toBeLessThan(32); // ~50% loss rate
    expect(withTech).toBeGreaterThan(realistic); // 0.15 cap with tech
    expect(ideal).toBeGreaterThan(30); // 5% ideal loss
  });

  it("a successful probe on an icy tile characterizes the deposit", () => {
    const world = makeWorld({ startTechs: ["night_landing_nav"] });
    world.enqueueCommand(CMD_LAUNCH_PROBE, { x: 7, y: 0 }); // fixture PSR, ice 5.6%
    world.run(TRANSIT + 2);
    const p = phase(world);
    expect(p.successfulLandings).toBe(1);
    expect(p.iceCharacterized).toBe(1);
  });

  it("sorties complete after the surface stay and count toward Phase 1", () => {
    const world = makeWorld({ startTechs: ["night_landing_nav"] });
    world.enqueueCommand(CMD_LAUNCH_SORTIE, {});
    world.run(Math.round(6.5 * 24) + 2);
    expect(phase(world).sortiesCompleted).toBe(1);
    const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(COLONY_ENTITY);
    expect(research.sciencePoints).toBeGreaterThanOrEqual(50);
  });

  it("repeating cargo missions reschedule; cancel stops them", () => {
    const world = makeWorld({ startTechs: ["night_landing_nav"] });
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [{ resource: R_FOOD, kg: 10 }],
      arrivalTick: 0,
      repeatTicks: 100,
      targetEntity: TANK,
      vehicle: "heavy",
    });
    world.run(TRANSIT + 201); // arrivals at 96, 196, 296
    expect(world.resources.amount(TANK, R_FOOD)).toBeCloseTo(30, 6);
    const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
    const missionEntity = missions.entities()[0] as number;
    world.enqueueCommand(CMD_CANCEL_RESUPPLY, { entity: missionEntity });
    world.run(300);
    expect(world.resources.amount(TANK, R_FOOD)).toBeCloseTo(30, 6);
  });

  it("night arrivals without nav tech carry the +5% penalty", () => {
    const world = makeWorld();
    const vehicle = {
      payloadKg: 100,
      usdPerKg: 1,
      failureIdeal: 0.02,
      failureRealistic: 0.5,
      transitDays: 4,
    };
    expect(missionFailureP(world, makeTestPack(), COLONY_ENTITY, vehicle, true)).toBeCloseTo(
      0.07,
      9,
    );
    expect(missionFailureP(world, makeTestPack(), COLONY_ENTITY, vehicle, false)).toBeCloseTo(
      0.02,
      9,
    );
  });
});
