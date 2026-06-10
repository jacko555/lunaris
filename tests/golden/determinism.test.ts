import { describe, expect, it } from "vitest";
import { createWorld, loadWorld, replayWorld, saveWorld } from "@lunaris/sim-core";
import {
  GOLDEN_SEED,
  GOLDEN_TICKS,
  goldenDef,
  runGoldenScenario,
  scriptCommands,
} from "./scenario.js";

/**
 * THE golden determinism test (TASKS.md M1): fixed seed + scripted commands,
 * 1,000 ticks, expected hash. Runs on the Node 20/22 CI matrix.
 *
 * If this hash changes, something altered simulation behavior. Per CLAUDE.md
 * hard rule 6, the new hash may only be committed with an explanation of the
 * cause in the commit/PR message.
 */
const EXPECTED_HASH_AFTER_1000_TICKS = "e0113657";

describe("golden determinism", () => {
  it(`produces the expected world hash after ${GOLDEN_TICKS} ticks`, () => {
    const world = runGoldenScenario();
    expect(world.tickCount).toBe(GOLDEN_TICKS);
    expect(world.hash()).toBe(EXPECTED_HASH_AFTER_1000_TICKS);
  });

  it("is reproducible across independent runs in the same process", () => {
    expect(runGoldenScenario().hash()).toBe(runGoldenScenario().hash());
  });

  it("replays identically from the recorded command log", () => {
    const original = runGoldenScenario();
    const replayed = replayWorld(
      goldenDef,
      { seed: GOLDEN_SEED, config: { scenario: "golden-m1" }, log: original.commandLog() },
      GOLDEN_TICKS,
    );
    expect(replayed.hash()).toBe(EXPECTED_HASH_AFTER_1000_TICKS);
  });

  it("save/load mid-run rejoins the golden trajectory exactly", () => {
    const world = createWorld(goldenDef, {
      seed: GOLDEN_SEED,
      config: { scenario: "golden-m1" },
    });
    scriptCommands(world);
    world.run(600);
    const resumed = loadWorld(goldenDef, saveWorld(world));
    resumed.run(GOLDEN_TICKS - 600);
    expect(resumed.hash()).toBe(EXPECTED_HASH_AFTER_1000_TICKS);
  });

  it("diverges for a different seed (the hash is not vacuous)", () => {
    const other = createWorld(goldenDef, {
      seed: GOLDEN_SEED + 1,
      config: { scenario: "golden-m1" },
    });
    scriptCommands(other);
    other.run(GOLDEN_TICKS);
    expect(other.hash()).not.toBe(EXPECTED_HASH_AFTER_1000_TICKS);
  });
});
