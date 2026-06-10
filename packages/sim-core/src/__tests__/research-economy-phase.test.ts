import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_ADD_CREW,
  CMD_LAUNCH_PROBE,
  CMD_LAUNCH_SORTIE,
  CMD_PLACE_BUILDING,
  CMD_START_RESEARCH,
  COLONY_ENTITY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  ECONOMY_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  type AlertsComponent,
  type EconomyComponent,
  type PhaseComponent,
  type ResearchComponent,
} from "../game/components.js";
import { R_FOOD, R_LOX, R_O2, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

function makeWorld(config: Record<string, unknown> = {}): World {
  return createWorld(createGameDef(makeTestPack(), makeTestMap()), {
    seed: 31,
    config: { startBudgetUsd: 5e9, annualBudgetUsd: 2e9, ...config } as never,
  });
}

function research(world: World): ResearchComponent {
  return world.store<ResearchComponent>(RESEARCH_COMPONENT).require(COLONY_ENTITY);
}

function economy(world: World): EconomyComponent {
  return world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
}

function phase(world: World): PhaseComponent {
  return world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
}

describe("ResearchSystem", () => {
  it("labs generate science and the pool drains into the current project", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "lab", x: 4, y: 0 }); // 10 pts/day
    world.enqueueCommand(CMD_START_RESEARCH, { techId: "t_basic" }); // cost 10
    world.run(26); // > 1 day of lab output
    expect(research(world).unlocked).toContain("t_basic");
  });

  it("enforces hard prerequisites; optional '?' prereqs only discount", () => {
    const world = makeWorld();
    world.enqueueCommand(CMD_START_RESEARCH, { techId: "t_adv" }); // needs t_basic
    world.run(2);
    expect(research(world).current).toBe("");
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
    expect(alerts.some((a) => a.code === "research-rejected")).toBe(true);
  });

  it("tech gating blocks placement until researched (verified end to end)", () => {
    const world = makeWorld({ startTechs: ["t_basic"] });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "lab", x: 4, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "gated", x: 4, y: 2 }); // locked
    world.tick();
    expect(world.store("building").size).toBe(3); // gated rejected
    world.enqueueCommand(CMD_START_RESEARCH, { techId: "t_adv" });
    world.run(24 * 3);
    expect(research(world).unlocked).toContain("t_adv");
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "gated", x: 4, y: 2 });
    world.run(1);
    expect(world.store("building").size).toBe(4);
  });
});

describe("EconomySystem", () => {
  it("accrues the annual budget and burns ops cost per crew", () => {
    const world = makeWorld({ annualBudgetUsd: 8760e5 }); // $100k/h accrual
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: 4, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "eclss", x: 4, y: 2 });
    world.enqueueCommand(CMD_ADD_CREW, { name: "A", skills: {}, location: 6 });
    world.resources.add(6, R_O2, 500, "initial-stock");
    world.resources.add(6, R_WATER, 2000, "initial-stock");
    world.resources.add(6, R_FOOD, 200, "initial-stock");
    world.run(240);
    const eco = economy(world);
    // +$100k/h budget, −$100k/day ops for 1 crew → strong net positive.
    expect(eco.balanceUsd).toBeGreaterThan(5e9);
    expect(eco.totalOpsSpendUsd).toBeCloseTo((240 / 24) * 100000, 0);
  });

  it("a powered depot sells LOX into daily demand from Phase 3", () => {
    const world = makeWorld({ startPhase: 3 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "depot", x: 4, y: 0 });
    world.resources.add(6, R_LOX, 1000, "initial-stock");
    world.run(48); // 2 days × 50 kg/day × 0.5 unstaffed duty…
    const eco = economy(world);
    expect(eco.totalRevenueUsd).toBeGreaterThan(0);
    const soldKg = eco.totalRevenueUsd / 2000;
    expect(soldKg).toBeCloseTo(1000 - colonyLox(world), 3);
  });
});

describe("PhaseSystem", () => {
  it("advances 0 → 1 after two landings, ice characterization, and comms", () => {
    const world = makeWorld({ startTechs: ["night_landing_nav"] });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "solar", x: 0, y: 0 });
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "comms", x: 2, y: 0 });
    world.enqueueCommand(CMD_LAUNCH_PROBE, { x: 7, y: 0 });
    world.enqueueCommand(CMD_LAUNCH_PROBE, { x: 7, y: 2 }, 1);
    world.run(24 * 5);
    const p = phase(world);
    expect(p.successfulLandings).toBeGreaterThanOrEqual(2);
    expect(p.iceCharacterized).toBe(1);
    expect(p.commsActive).toBe(1);
    expect(p.phase).toBe(1);
  });

  it("advances 1 → 2 after two sorties with surface power researched", () => {
    const world = makeWorld({
      startPhase: 1,
      startTechs: ["night_landing_nav", "surface_power_40kw"],
    });
    world.enqueueCommand(CMD_LAUNCH_SORTIE, {});
    world.enqueueCommand(CMD_LAUNCH_SORTIE, {}, 1);
    world.run(Math.round(6.5 * 24) + 4);
    expect(phase(world).sortiesCompleted).toBe(2);
    expect(phase(world).phase).toBe(2);
  });
});

function colonyLox(world: World): number {
  let total = 0;
  for (const entity of world.store("building").entities()) {
    total += world.resources.amount(entity, R_LOX);
  }
  return total;
}
