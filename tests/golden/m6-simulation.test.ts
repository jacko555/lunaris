import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CMD_SET_POLICY,
  COLONY_ENTITY,
  PHASE_COMPONENT,
  createGameDef,
  createWorld,
  hashValue,
  loadContentPack,
  loadMap,
  scenarioSeed,
  scenarioToConfig,
  type LunarMap,
  type PhaseComponent,
  type Scenario,
  type World,
} from "@lunaris/sim-core";

/**
 * Milestone 6 acceptance (TASKS.md): the Policy AI auto-runs the shipped
 * scenario presets reproducibly. Each preset's milestone TIMELINE (the
 * observer-mode ribbon) is golden-hashed at a 2-year horizon; the
 * "Realistic Trajectory" run must produce a plausible early-Artemis
 * timeline; and `Take Command` works mid-run.
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
  scenarios: readJson("scenarios"),
});
// Scenarios choose their site (ilrs_race runs at de Gerlache); the pack
// sorts maps by id, so select by id — never by index.
const gameDefs = new Map<string, ReturnType<typeof createGameDef>>();
function gameDefFor(site: string): ReturnType<typeof createGameDef> {
  let def = gameDefs.get(site);
  if (def === undefined) {
    const doc = pack.maps.find((m) => m.id === site) as (typeof pack.maps)[number];
    const map: LunarMap = loadMap(doc);
    def = createGameDef(pack, map);
    gameDefs.set(site, def);
  }
  return def;
}
const gameDef = gameDefFor("shackleton_rim");

const TWO_YEARS = 2 * 8766;

function runScenario(scenario: Scenario, ticks: number): World {
  const world = createWorld(gameDefFor(scenario.site), {
    seed: scenarioSeed(scenario, 1),
    config: scenarioToConfig(scenario),
  });
  world.run(ticks);
  return world;
}

function timeline(world: World): { tick: number; id: string }[] {
  return world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY).milestones;
}

describe("M6 acceptance: simulation mode", () => {
  it("every preset auto-runs to a reproducible milestone timeline (fixed seed)", () => {
    /**
     * Golden timeline hashes @ 2 years per preset (CLAUDE.md rule 6: only
     * change with an explained cause — these ARE the observer ribbons).
     */
    const expected: Record<string, string> = {
      artemis_baseline: "37383c56",
      ideal_trajectory: "37383c56",
      realistic_trajectory: "4522ceee",
      ilrs_race: "5c6690d1",
      commercial_bootstrap: "e7edc256",
    };
    const actual: Record<string, string> = {};
    for (const scenario of pack.scenarios) {
      const world = runScenario(scenario, TWO_YEARS);
      actual[scenario.id] = hashValue(timeline(world));
    }
    expect(actual).toEqual(expected);
  });

  it("the Realistic Trajectory produces a plausible Artemis-era opening", () => {
    const scenario = pack.scenarios.find((s) => s.id === "realistic_trajectory") as Scenario;
    const world = runScenario(scenario, TWO_YEARS);
    const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
    // Two years of a cautious, realistic-failure program: the robotic
    // precursor phase should be done (or nearly), nothing further —
    // mirroring the real 2026-2028 CLPS era.
    expect(phase.successfulLandings).toBeGreaterThanOrEqual(1);
    expect(phase.phase).toBeGreaterThanOrEqual(1);
    expect(phase.phase).toBeLessThanOrEqual(2);
    expect(timeline(world).length).toBeGreaterThan(0);
  });

  it("the user can take command mid-run and hand back (same world)", () => {
    const scenario = pack.scenarios.find((s) => s.id === "artemis_baseline") as Scenario;
    const world = createWorld(gameDef, {
      seed: scenarioSeed(scenario, 1),
      config: scenarioToConfig(scenario),
    });
    world.run(5000);
    const hashBefore = world.hash();
    world.enqueueCommand(CMD_SET_POLICY, { enabled: 0 });
    world.run(100);
    world.enqueueCommand(CMD_SET_POLICY, { enabled: 1 });
    world.run(100);
    expect(world.hash()).not.toBe(hashBefore); // world advanced, no crash
    expect(world.tickCount).toBe(5200);
  });
});
