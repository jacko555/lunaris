import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILDING_COMPONENT,
  CMD_ADD_CREW,
  CMD_PLACE_BUILDING,
  CMD_QUEUE_BUILD,
  CMD_SCHEDULE_RESUPPLY,
  COLONY_ENTITY,
  CREW_COMPONENT,
  STATS_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
  type BuildingComponent,
  type CrewComponent,
  type LunarMap,
  type StatsComponent,
  type World,
} from "@lunaris/sim-core";

/**
 * Milestone 4 — "MVP baseline" scenario regression (TASKS.md): a crewed
 * outpost stands up the full ice → water ISRU chain plus regolith printing,
 * queues a landing pad through the construction system, and reaches the
 * v0.1 acceptance milestone: ≥50% of O₂+water locally produced in a lunar
 * cycle. 5,000-tick golden hash.
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
const map: LunarMap = loadMap(pack.maps[0] as (typeof pack.maps)[number]);
const gameDef = createGameDef(pack, map);

const SEED = 20260610;
const MVP_TICKS = 5000;
const TICKS_PER_LUNAR_DAY = 709;

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

/** First ice-bearing PSR tile gentle enough for the harvester. */
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

export function makeMvpWorld(): World {
  const site = findBuildSite(12, 8);
  const mine = findMiningSite();
  const world = createWorld(gameDef, {
    seed: SEED,
    config: {
      scenario: "mvp-baseline",
      startPhase: 2,
      startBudgetUsd: 20e9,
      annualBudgetUsd: 8e9,
      startTechs: [
        "eclss_baseline",
        "surface_power_40kw",
        "ice_prospecting",
        "ice_mining_pilot",
        "regolith_printing",
        "night_landing_nav",
      ],
    },
  });
  const place = (defId: string, dx: number, dy: number, at = 0): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy }, at);
  };
  // The M3 outpost…
  place("foundation-habitat", 0, 0); // 4
  place("foundation-habitat", 0, 3); // 5
  place("fission-surface-power", 3, 0); // 6
  place("radiator-wing", 3, 3); // 7
  place("radiator-wing", 4, 3); // 8
  place("eclss-core", 5, 0); // 9
  place("storm-shelter", 5, 2); // 10
  place("water-gas-storage", 6, 5); // 11
  place("exercise-module", 7, 0); // 12
  place("exercise-module", 7, 2); // 13
  place("clinic", 9, 2); // 14
  place("comms-tower", 9, 0); // 15
  place("eclss-core", 5, 4); // 16 — redundancy against the outage deck
  // …plus the M4 ISRU chain and printer.
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "ice-harvester", x: mine.x, y: mine.y }); // 17
  place("volatile-oven", 7, 6); // 18
  place("regolith-printer", 9, 4); // 19

  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 400 },
      { resource: "water", kg: 2500 },
      { resource: "o2-gas", kg: 200 },
      { resource: "medkits", kg: 15 },
      { resource: "spare-parts", kg: 2000 },
    ],
    arrivalTick: 0,
    targetEntity: 11,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 160 },
      { resource: "medkits", kg: 5 },
      { resource: "spare-parts", kg: 300 },
    ],
    arrivalTick: TICKS_PER_LUNAR_DAY,
    repeatTicks: TICKS_PER_LUNAR_DAY,
    targetEntity: 11,
    vehicle: "heavy",
  });
  for (const name of ["Reid", "Glover", "Koch", "Hansen", "Mann", "Wakata"]) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: 4 }, 100);
  }
  // Construction system exercise: once the printer has produced ~5 t of
  // printed structure, the queued landing pad pays its local recipe.
  world.enqueueCommand(CMD_QUEUE_BUILD, { defId: "landing-pad", x: site.x, y: site.y + 6 }, 200);
  return world;
}

describe("M4 acceptance: v0.1 MVP baseline", () => {
  const world = makeMvpWorld();
  world.run(MVP_TICKS);

  it("reaches the ≥50% O₂+water locally-produced milestone", () => {
    const stats = world.store<StatsComponent>(STATS_COMPONENT).require(COLONY_ENTITY);
    expect(stats.isru50Milestone).toBe(1);
    expect(stats.lastCycleLocalShare).toBeGreaterThan(0.5);
  });

  it("the crew survives the whole 5,000 ticks", () => {
    const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
    expect(crews.filter(([, c]) => c.alive === 1)).toHaveLength(6);
  });

  it("the queued landing pad was built from printed regolith", () => {
    const pads = [...world.store<BuildingComponent>(BUILDING_COMPONENT).entries()].filter(
      ([, b]) => b.defId === "landing-pad",
    );
    expect(pads).toHaveLength(1);
  });

  it("reproduces the MVP golden hash after 5,000 ticks (CLAUDE.md rule 6)", () => {
    expect(world.hash()).toBe("a9341726");
  });
});
