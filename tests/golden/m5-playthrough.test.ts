import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CMD_ADD_CREW,
  CMD_LAUNCH_PROBE,
  CMD_LAUNCH_SORTIE,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  CMD_START_RESEARCH,
  COLONY_ENTITY,
  CREW_COMPONENT,
  PHASE_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
  type CrewComponent,
  type LunarMap,
  type PhaseComponent,
  type World,
} from "@lunaris/sim-core";

/**
 * Milestone 5 acceptance (TASKS.md): a full Phase 0 → 3 playthrough in game
 * mode — robotic prospecting, crewed sorties, the researched outpost, six
 * months of occupation through lunar nights, and the first ISRU water —
 * driven entirely by player-style commands. Reproducible end to end
 * (golden hash).
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "base");
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), "utf8")) as unknown;

const pack = loadContentPack("base", {
  constants: readJson("constants"),
  resources: readJson("resources"),
  reactions: readJson("reactions"),
  buildings: readJson("buildings"),
  tech: readJson("tech"),
  events: readJson("events"),
  encyclopedia: readJson("encyclopedia"),
  maps: readJson("maps"),
});
const map: LunarMap = loadMap(
  pack.maps.find((m) => m.id === "shackleton_rim") as (typeof pack.maps)[number],
);
const gameDef = createGameDef(pack, map);

function findBuildSite(width: number, height: number): { x: number; y: number } {
  for (let y = 2; y < map.height - height - 2; y++) {
    for (let x = 2; x < map.width - width - 2; x++) {
      let ok = true;
      for (let dy = 0; dy < height && ok; dy++) {
        for (let dx = 0; dx < width && ok; dx++) {
          const tile = tileAt(map, x + dx, y + dy);
          ok = tile.illumClass === "B" && tile.slopeDeg <= 5 && tile.regolith === "highland";
        }
      }
      if (ok) {
        return { x, y };
      }
    }
  }
  throw new Error("No buildable site");
}

function findMiningSite(): { x: number; y: number } {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = tileAt(map, x, y);
      if (tile.illumClass === "C" && tile.iceFrac > 0.03 && tile.slopeDeg <= 15) {
        return { x, y };
      }
    }
  }
  throw new Error("No minable PSR tile");
}

function makePlaythrough(): World {
  const site = findBuildSite(12, 8);
  const mine = findMiningSite();
  const world = createWorld(gameDef, {
    seed: 904,
    config: {
      scenario: "phase-playthrough",
      startPhase: 0,
      startBudgetUsd: 30e9,
      annualBudgetUsd: 10e9,
      failureTables: "ideal",
    },
  });
  const place = (defId: string, dx: number, dy: number, at: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy }, at);
  };

  // ── Phase 0: robotic precursors ──
  place("solar-array-10kw", 0, 6, 0);
  place("solar-array-10kw", 2, 6, 0);
  place("rtg-keepalive", 4, 6, 0); // night keep-alive for the ground segment
  place("rtg-keepalive", 5, 6, 0);
  place("rtg-keepalive", 6, 6, 0);
  place("rtg-keepalive", 7, 6, 0);
  place("comms-tower", 9, 0, 0); // relay criterion
  place("field-lab", 9, 6, 0);
  place("field-lab", 10, 6, 0); // 10 science/day
  world.enqueueCommand(CMD_LAUNCH_PROBE, { x: mine.x, y: mine.y }, 0);
  world.enqueueCommand(CMD_LAUNCH_PROBE, { x: mine.x + 1, y: mine.y }, 1);
  world.enqueueCommand(CMD_LAUNCH_PROBE, { x: mine.x, y: mine.y + 1 }, 2);

  // ── research queue (sequenced with generous margins) ──
  world.enqueueCommand(CMD_START_RESEARCH, { techId: "surface_power_40kw" }, 10); // 50 pts
  world.enqueueCommand(CMD_START_RESEARCH, { techId: "eclss_baseline" }, 250); // 1 pt
  world.enqueueCommand(CMD_START_RESEARCH, { techId: "ice_prospecting" }, 280); // 20 pts
  world.enqueueCommand(CMD_START_RESEARCH, { techId: "ice_mining_pilot" }, 420); // 60 pts

  // ── Phase 1: sortie campaign (three launches; ≥2 must succeed) ──
  world.enqueueCommand(CMD_LAUNCH_SORTIE, {}, 150);
  world.enqueueCommand(CMD_LAUNCH_SORTIE, {}, 320);
  world.enqueueCommand(CMD_LAUNCH_SORTIE, {}, 490);

  // ── Phase 2: the outpost (placements gated by the research above) ──
  place("fission-surface-power", 3, 0, 700);
  place("radiator-wing", 3, 3, 700);
  place("radiator-wing", 4, 3, 700);
  place("foundation-habitat", 0, 0, 700);
  place("foundation-habitat", 0, 3, 700);
  place("eclss-core", 5, 0, 700);
  place("storm-shelter", 5, 2, 700);
  place("water-gas-storage", 6, 5, 700);
  place("exercise-module", 7, 0, 700);
  place("exercise-module", 7, 2, 700);
  place("clinic", 9, 2, 700);
  place("eclss-core", 5, 4, 700); // redundancy: the M7 outage deck WILL hit one
  world.enqueueCommand(
    CMD_SCHEDULE_RESUPPLY,
    {
      manifest: [
        { resource: "food", kg: 400 },
        { resource: "water", kg: 2500 },
        { resource: "o2-gas", kg: 200 },
        { resource: "medkits", kg: 15 },
        { resource: "spare-parts", kg: 2000 },
      ],
      arrivalTick: 700,
      // Entity 26: ground segment 4–12, probe missions 13–15, sorties
      // 16–18, then the 11 outpost placements 19–29 → storage is the 8th.
      targetEntity: -1, // sentinel: resolve at execution
      vehicle: "heavy",
    },
    700,
  );
  world.enqueueCommand(
    CMD_SCHEDULE_RESUPPLY,
    {
      manifest: [
        { resource: "food", kg: 160 },
        { resource: "medkits", kg: 5 },
        { resource: "spare-parts", kg: 300 },
      ],
      arrivalTick: 1500,
      repeatTicks: 709,
      targetEntity: -1, // sentinel: resolve at execution
      vehicle: "heavy",
    },
    710,
  );
  for (const name of ["Reid", "Glover", "Koch", "Hansen", "Mann", "Wakata"]) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: -1 }, 900);
  }

  // ── Phase 3 inputs: ISRU demo in the PSR ──
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "ice-harvester", x: mine.x, y: mine.y }, 1100);
  place("volatile-oven", 7, 4, 1100);
  return world;
}

describe("M5 acceptance: full Phase 0 → 3 playthrough", () => {
  const world = makePlaythrough();
  const phaseAt: Record<number, number> = {};
  for (let t = 0; t < 5300; t++) {
    world.tick();
    const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
    if (phaseAt[phase.phase] === undefined) {
      phaseAt[phase.phase] = world.tickCount;
    }
  }
  const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);

  it("progresses through every phase transition in order", () => {
    expect(phase.phase).toBe(3);
    expect(phaseAt[1]).toBeLessThan(phaseAt[2] as number);
    expect(phaseAt[2]).toBeLessThan(phaseAt[3] as number);
    expect(phase.milestones.some((m) => m.id === "phase-1")).toBe(true);
    expect(phase.milestones.some((m) => m.id === "phase-2")).toBe(true);
    expect(phase.milestones.some((m) => m.id === "phase-3")).toBe(true);
    expect(phase.milestones.some((m) => m.id === "night-survived")).toBe(true);
    expect(phase.milestones.some((m) => m.id === "isru-demo")).toBe(true);
  });

  it("the crew is alive at Phase 3", () => {
    const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
    expect(crews.filter(([, c]) => c.alive === 1).length).toBeGreaterThanOrEqual(5);
  });

  it("reproduces the playthrough golden hash (CLAUDE.md rule 6)", () => {
    expect(world.hash()).toBe("7bb170df");
  });
});
