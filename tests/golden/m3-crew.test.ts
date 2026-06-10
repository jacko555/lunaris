import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALERTS_COMPONENT,
  CMD_ADD_CREW,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  CREW_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
  type AlertsComponent,
  type CrewComponent,
  type LunarMap,
  type World,
} from "@lunaris/sim-core";

/**
 * Milestone 3 acceptance (TASKS.md): a 6-crew outpost on the real pack and
 * Shackleton map survives 3 lunar cycles with scheduled resupply; killing
 * resupply produces the legible food → morale → health cascade within
 * expected tick counts. Plus the M3 scenario golden hash.
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "base");

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), "utf8")) as unknown;
}

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
const THREE_LUNAR_CYCLES = 2127; // 3 × 708.72, rounded up
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
  throw new Error("No buildable site on the Shackleton map");
}

const CREW_NAMES = ["Reid", "Glover", "Koch", "Hansen", "Mann", "Wakata"];

/** Hab is the 4th entity (after the three singletons). */
const HAB = 4;

function makeCrewedOutpost(withResupply: boolean): World {
  const site = findBuildSite(12, 8);
  const world = createWorld(gameDef, {
    seed: SEED,
    config: { scenario: withResupply ? "m3-crewed-outpost" : "m3-resupply-cutoff" },
  });
  const place = (defId: string, dx: number, dy: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy });
  };
  // Tick 0: infrastructure (entity ids 4..) and the seed cargo. Two
  // radiator wings: the day-side waste heat of two habs plus the reactor
  // (~19 kW) exceeds a single 15 kW wing — M2's thermal system priced that
  // lesson in.
  place("foundation-habitat", 0, 0); // 4
  place("foundation-habitat", 0, 3); // 5  (housing 8 total for 6 crew)
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
  // Generous water seed: the OGA electrolyzes ~5.7 kg water/day into the
  // crew's O₂, so water buffers both thirst AND breath. In the cutoff
  // scenario this keeps food the binding constraint (the legible cascade).
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 250 },
      { resource: "water", kg: 2500 },
      { resource: "o2-gas", kg: 150 },
      { resource: "medkits", kg: 10 },
    ],
    arrivalTick: 0,
    targetEntity: 11,
  });
  if (withResupply) {
    // Standing cadence: one cargo lander per lunar day.
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [
        { resource: "food", kg: 140 },
        { resource: "water", kg: 250 },
        { resource: "medkits", kg: 5 },
      ],
      arrivalTick: TICKS_PER_LUNAR_DAY,
      repeatTicks: TICKS_PER_LUNAR_DAY,
      targetEntity: 11,
    });
  }
  // Tick 1: crew land after the seed cargo is on the ground.
  for (const name of CREW_NAMES) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: HAB }, 1);
  }
  return world;
}

function livingCrew(world: World): CrewComponent[] {
  return [...world.store<CrewComponent>(CREW_COMPONENT).entries()]
    .map(([, crew]) => crew)
    .filter((crew) => crew.alive === 1);
}

describe("M3 acceptance: 6-crew outpost", () => {
  it("survives 3 lunar cycles with scheduled resupply, all six alive and healthy", () => {
    const world = makeCrewedOutpost(true);
    world.run(THREE_LUNAR_CYCLES);
    const crew = livingCrew(world);
    expect(crew).toHaveLength(6);
    for (const member of crew) {
      expect(member.health).toBeGreaterThan(80);
      expect(member.hungerHours).toBe(0);
      expect(member.thirstHours).toBe(0);
      expect(member.hypoxiaHours).toBe(0);
      expect(member.radiationSick).toBe(0);
    }
  });

  it("killing resupply causes the legible food → morale → health cascade", () => {
    const world = makeCrewedOutpost(false);
    const alertsStore = world.store<AlertsComponent>(ALERTS_COMPONENT);

    // Food: 250 kg ÷ (6 × 0.62/day) ≈ 67 days. Water recycles at 93%, so
    // food is the binding constraint, exactly as the cascade intends.
    let foodAlertTick = -1;
    let firstDeathTick = -1;
    let moraleAtFoodOut = -1;
    let moraleFloorTick = -1;
    for (let t = 0; t < 24 * 130 && firstDeathTick < 0; t++) {
      world.tick();
      for (const entry of alertsStore.require(3).entries) {
        if (entry.code === "food-depleted" && foodAlertTick < 0) {
          foodAlertTick = entry.tick;
          moraleAtFoodOut = Math.max(...livingCrew(world).map((c) => c.morale));
        }
        if (entry.code === "crew-death" && firstDeathTick < 0) {
          firstDeathTick = entry.tick;
          expect(entry.message).toMatch(/starvation/);
        }
      }
      const living = livingCrew(world);
      if (moraleFloorTick < 0 && living.length > 0 && living.every((c) => c.morale <= 1)) {
        moraleFloorTick = world.tickCount;
      }
    }

    // 1. Food runs out around day ~67 (alert names the cause).
    expect(foodAlertTick).toBeGreaterThan(24 * 60);
    expect(foodAlertTick).toBeLessThan(24 * 75);
    // 2. Morale was healthy when food ran out, then collapses (~7 days).
    expect(moraleAtFoodOut).toBeGreaterThan(50);
    expect(moraleFloorTick).toBeGreaterThan(foodAlertTick);
    expect(moraleFloorTick).toBeLessThan(foodAlertTick + 24 * 10);
    // 3. Health decline kills ~40-47 days after the food ran out (the
    //    clinic palliates the treated, stretching the first death slightly).
    expect(firstDeathTick).toBeGreaterThan(foodAlertTick + 24 * 35);
    expect(firstDeathTick).toBeLessThan(foodAlertTick + 24 * 50);
  });
});

describe("M3 scenario golden hash", () => {
  /** Changes here need an explained cause in the commit (CLAUDE.md rule 6). */
  const EXPECTED_HASH = "39df34bf";

  it("crewed outpost reproduces the golden hash after 3 lunar cycles", () => {
    const world = makeCrewedOutpost(true);
    world.run(THREE_LUNAR_CYCLES);
    expect(world.hash()).toBe(EXPECTED_HASH);
  });
});
