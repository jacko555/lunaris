import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUILDING_COMPONENT,
  CMD_PLACE_BUILDING,
  createGameDef,
  createWorld,
  GRID_COMPONENT,
  GRID_ENTITY,
  loadContentPack,
  loadMap,
  tileAt,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type GridComponent,
  type LunarMap,
  type ThermalComponent,
  type World,
} from "@lunaris/sim-core";

/**
 * Milestone 2 acceptance (TASKS.md): on the real Shackleton-rim map with
 * the real base pack, a solar+battery outpost browns out and freezes
 * during the lunar night; the same base with 40 kWe fission survives.
 * Plus the M2 scenario golden hash.
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
const TWO_LUNAR_DAYS = 1418;

/** Mirrors the web client's deterministic site search. */
function findBuildSite(width: number, height: number): { x: number; y: number } {
  for (let y = 2; y < map.height - height - 2; y++) {
    for (let x = 2; x < map.width - width - 2; x++) {
      let ok = true;
      for (let dy = 0; dy < height && ok; dy++) {
        for (let dx = 0; dx < width && dx < width && ok; dx++) {
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

function makeOutpost(withFission: boolean): World {
  const site = findBuildSite(9, 7);
  const world = createWorld(gameDef, {
    seed: SEED,
    config: {
      scenario: withFission ? "outpost-fission" : "outpost-solar",
      startPhase: 2,
      // M5 tech gating: outpost scenarios start with Phase-2 power research done.
      startTechs: ["surface_power_40kw"],
    },
  });
  const place = (defId: string, dx: number, dy: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy });
  };
  place("foundation-habitat", 0, 0);
  place("solar-array-10kw", 3, 0);
  place("solar-array-10kw", 5, 0);
  place("solar-array-10kw", 7, 0);
  place("battery-bank", 3, 3);
  place("battery-bank", 4, 3);
  place("radiator-wing", 6, 3);
  if (withFission) {
    place("fission-surface-power", 0, 4);
  }
  return world;
}

interface RunReport {
  everBrownedOut: boolean;
  everFroze: boolean;
  tier0EverShed: boolean;
  habCondition: number;
  hash: string;
}

function runOutpost(world: World, ticks: number): RunReport {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);
  const report: RunReport = {
    everBrownedOut: false,
    everFroze: false,
    tier0EverShed: false,
    habCondition: 1,
    hash: "",
  };
  for (let t = 0; t < ticks; t++) {
    world.tick();
    const grid = world.store<GridComponent>(GRID_COMPONENT).require(GRID_ENTITY);
    report.everBrownedOut ||= grid.brownout === 1;
    report.tier0EverShed ||= (grid.tierFraction[0] as number) < 1;
    for (const [entity, building] of buildings.entries()) {
      if (building.defId === "foundation-habitat") {
        report.habCondition = building.condition;
        report.everFroze ||= thermals.require(entity).state === "freeze";
      }
    }
  }
  report.hash = world.hash();
  return report;
}

describe("M2 acceptance: the lunar night", () => {
  it("solar+battery base browns out and freezes during the night", () => {
    const report = runOutpost(makeOutpost(false), TWO_LUNAR_DAYS);
    expect(report.everBrownedOut).toBe(true);
    expect(report.tier0EverShed).toBe(true);
    expect(report.everFroze).toBe(true);
    expect(report.habCondition).toBeLessThan(1);
  });

  it("the same base with 40 kWe fission survives two full cycles", () => {
    const report = runOutpost(makeOutpost(true), TWO_LUNAR_DAYS);
    expect(report.everFroze).toBe(false);
    expect(report.tier0EverShed).toBe(false);
    // Wear (~0.8%/two cycles) plus the odd micrometeorite hit (M7 deck).
    expect(report.habCondition).toBeGreaterThan(0.85);
  });
});

describe("M2 scenario golden hash", () => {
  /**
   * Golden hash for the fission outpost after two lunar cycles. Changes to
   * environment/power/thermal behavior, the base pack, or the map move this
   * hash — explain the cause in the commit message (CLAUDE.md rule 6).
   */
  /**
   * History: c6f78a33 (M2 original) → 4f36011a at M3 (crew/resupply stores
   * registered) → d08e98e2 at M4/M5: seven new component stores in the
   * snapshot (sites, dust, stats, research, economy, phase, pending
   * hazards), buildings carry offlineUntilTick, the hazard engine and wear
   * draw from the shared RNG each tick, and the scenario config gained
   * startPhase/startTechs for tech gating. The outpost still freezes
   * without fission and survives with it (asserted above).
   */
  const EXPECTED_HASH = "a8a597fd";

  it("fission outpost reproduces the golden hash after two lunar cycles", () => {
    const report = runOutpost(makeOutpost(true), TWO_LUNAR_DAYS);
    expect(report.hash).toBe(EXPECTED_HASH);
  });
});
