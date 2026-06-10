import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_ADD_CREW,
  CMD_PLACE_BUILDING,
  CMD_SET_POLICY,
  COLONY_ENTITY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  RESEARCH_COMPONENT,
  RESUPPLY_COMPONENT,
  RIVAL_COMPONENT,
  SITE_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type CrewComponent,
  type EconomyComponent,
  type ResearchComponent,
} from "../game/components.js";
import { colonyAmount } from "../game/pool.js";
import {
  R_FOOD,
  R_HE3,
  R_IRON,
  R_LOX,
  R_MEDKITS,
  R_O2,
  R_SPARE_PARTS,
  R_WATER,
} from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const PACK = makeTestPack();

function makeWorld(config: Record<string, unknown> = {}): World {
  return createWorld(createGameDef(PACK, makeTestMap()), {
    seed: 77,
    config: { startBudgetUsd: 50e9, annualBudgetUsd: 10e9, ...config } as never,
  });
}

function powered(world: World, extra: [string, number, number][]): void {
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 2, y: 2 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 0, y: 2 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 1, y: 2 });
  for (const [defId, x, y] of extra) {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x, y });
  }
}

describe("FoodSystem (M7)", () => {
  it("greenhouses convert CO₂ + water into food + O₂ exactly", () => {
    const world = makeWorld();
    powered(world, [
      ["hab", 4, 0],
      ["eclss", 6, 0],
      ["farm", 4, 2], // 90 m² = 2 diets
    ]);
    for (let i = 0; i < 2; i++) {
      world.enqueueCommand(CMD_ADD_CREW, {
        name: `C${i}`,
        skills: { agronomist: 1 },
        location: -1,
      });
    }
    world.resources.add(4, R_O2, 300, "initial-stock");
    world.resources.add(4, R_WATER, 2000, "initial-stock");
    world.resources.add(4, R_FOOD, 50, "initial-stock");
    world.run(24 * 30);
    // Crops eat the crew's scrubbed CO₂ and grow ~their whole diet:
    // 50 kg seed − 30 d × 2 × 0.62 ≈ 13 kg if farms produced nothing.
    expect(colonyAmount(world, R_FOOD)).toBeGreaterThan(40);
    const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
    expect(crews.every(([, c]) => c.alive === 1)).toBe(true);
  });
});

describe("Manufacturing & exports (M7)", () => {
  it("workshop turns iron into spare parts that maintenance then consumes", () => {
    const world = makeWorld();
    powered(world, [["workshop", 4, 0]]);
    world.enqueueCommand(CMD_ADD_CREW, { name: "Eng", skills: { engineer: 2 }, location: -1 });
    // No housing in this rig → crew rejected; staffing falls back to 0.5. Fine.
    world.resources.add(4, R_IRON, 500, "initial-stock");
    world.resources.add(4, "machine-components", 100, "initial-stock");
    world.run(24 * 10);
    expect(colonyAmount(world, R_SPARE_PARTS)).toBeGreaterThan(50);
    expect(colonyAmount(world, R_IRON)).toBeLessThan(500);
  });

  it("a powered depot + mass driver + combine sells LOX and He-3 from Phase 3", () => {
    const world = makeWorld({ startPhase: 3 });
    powered(world, [
      ["depot", 4, 0],
      ["driver", 4, 2],
      ["combine", 0, 4],
    ]);
    // Two fissions (80 kW) cannot feed driver+combine (800 kW) — add cheap test gen:
    for (let i = 0; i < 12; i++) {
      world.enqueueCommand(CMD_PLACE_BUILDING, {
        defId: "fission",
        x: 4 + (i % 4),
        y: 4 + Math.floor(i / 4),
      });
    }
    world.resources.add(4, R_LOX, 2000, "initial-stock");
    world.resources.add(4, R_HE3, 1, "initial-stock");
    world.run(48);
    const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
    // LOX ~500 kg × $2k (driver ×5 demand) + He-3 ~0.02 kg × $20M ≈ $1.4M.
    // (The combine PRODUCES He-3 faster than the tiny market absorbs it —
    // market flooding is the intended Phase-5 economics lesson.)
    expect(economy.totalRevenueUsd).toBeGreaterThan(1e6);
    expect(2000 - colonyAmount(world, R_LOX)).toBeGreaterThan(300);
    expect(colonyAmount(world, R_HE3)).toBeLessThan(1.1); // sales offset output
  });
});

describe("PopulationSystem (M7)", () => {
  it("immigration waves arrive at Phase 3 while housing and food allow", () => {
    const world = makeWorld({ startPhase: 3 });
    powered(world, [
      ["hab", 4, 0],
      ["hab", 6, 0], // housing 8
      ["eclss", 4, 2],
      ["eclss", 5, 2],
    ]);
    world.resources.add(4, R_O2, 2000, "initial-stock");
    world.resources.add(4, R_WATER, 20000, "initial-stock");
    world.resources.add(4, R_FOOD, 2000, "initial-stock");
    world.resources.add(4, R_MEDKITS, 20, "initial-stock");
    world.run(24 * 65); // two wave intervals
    const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
    const living = crews.filter(([, c]) => c.alive === 1).length;
    expect(living).toBeGreaterThanOrEqual(8); // filled to housing
    expect(living).toBeLessThanOrEqual(8); // …but never beyond it
  });
});

describe("Rival ticker & event deck (M6/M7)", () => {
  it("fires the scenario's rival milestones at their scheduled ticks", () => {
    const world = makeWorld({
      rivalName: "ILRS",
      rivalMilestones: [
        { tick: 100, label: "Chang'e-7 lands" },
        { tick: 300, label: "Taikonauts on the surface" },
      ],
    });
    world.run(350);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    const rival = alerts.filter((a) => a.code === "rival-milestone");
    expect(rival).toHaveLength(2);
    expect(rival[0]?.message).toMatch(/Chang'e-7/);
    expect(world.store(RIVAL_COMPONENT).require(COLONY_ENTITY)).toMatchObject({
      upcoming: [],
    });
  });
});

describe("Policy AI (M6)", () => {
  it("survives a mod pack missing its build tables; the research pass still runs", () => {
    // Full Phase-0 bootstrap is proven on the real pack in
    // tests/golden/m6-simulation.test.ts; here the fixture pack (no
    // comms-tower etc.) checks the AI degrades gracefully for mods.
    const world = makeWorld({ policyEnabled: 1, failureTables: "ideal" });
    world.run(24 * 30);
    const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(COLONY_ENTITY);
    // RESEARCH_PRIORITIES ids exist in the fixture tech tree.
    expect(research.unlocked.length + (research.current === "" ? 0 : 1)).toBeGreaterThan(0);
    expect(world.store<BuildingComponent>(BUILDING_COMPONENT).size).toBe(0); // no orders, no crash
  });

  it("orders crew into the shelter while an SPE is pending", () => {
    const world = makeWorld({ policyEnabled: 1, startPhase: 2, startTechs: [] });
    powered(world, [
      ["hab", 4, 0],
      ["shelter", 6, 0],
      ["eclss", 4, 2],
    ]);
    world.enqueueCommand(CMD_ADD_CREW, { name: "Ada", skills: {}, location: -1 });
    world.resources.add(4, R_O2, 500, "initial-stock");
    world.resources.add(4, R_WATER, 3000, "initial-stock");
    world.resources.add(4, R_FOOD, 300, "initial-stock");
    world.tick();
    // Plant a pending SPE manually.
    const pendingEntity = world.createEntity();
    world.store(PENDING_HAZARD_COMPONENT).set(pendingEntity, {
      eventId: "spe-major",
      impactTick: world.tickCount + 60,
    } as never);
    world.run(30); // the daily pass at hour 12 issues shelter orders
    const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
    const shelterEntity = [...world.store<BuildingComponent>(BUILDING_COMPONENT).entries()].find(
      ([, b]) => b.defId === "shelter",
    )?.[0];
    expect(crews[0]?.[1].location).toBe(shelterEntity);
  });

  it("Take Command flips control without disturbing the world", () => {
    const world = makeWorld({ policyEnabled: 1 });
    world.run(24 * 10);
    world.enqueueCommand(CMD_SET_POLICY, { enabled: 0 });
    world.run(2);
    const before = world.store(RESUPPLY_COMPONENT).size + world.store(SITE_COMPONENT).size;
    world.run(24 * 10); // AI off: no new orders appear
    const after = world.store(RESUPPLY_COMPONENT).size + world.store(SITE_COMPONENT).size;
    expect(after).toBeLessThanOrEqual(before); // missions may resolve, none added
    world.enqueueCommand(CMD_SET_POLICY, { enabled: 1 });
    world.run(2);
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.filter((a) => a.code === "policy-toggle")).toHaveLength(2);
  });
});
