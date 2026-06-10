import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  mergePacks,
} from "@lunaris/sim-core";

/**
 * M7 acceptance: the shipped demo mod pack loads partially, merges over the
 * base pack, and a world runs on the merged content (the web client's 🧩
 * Mod button does exactly this).
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (rel: string): unknown =>
  JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as unknown;

describe("mods/demo-mod.json", () => {
  it("merges over the base pack and simulates", () => {
    const base = loadContentPack("base", {
      constants: readJson("data/base/constants.json"),
      resources: readJson("data/base/resources.json"),
      reactions: readJson("data/base/reactions.json"),
      buildings: readJson("data/base/buildings.json"),
      tech: readJson("data/base/tech.json"),
      events: readJson("data/base/events.json"),
      encyclopedia: readJson("data/base/encyclopedia.json"),
      maps: readJson("data/base/maps.json"),
      scenarios: readJson("data/base/scenarios.json"),
    });
    const modDoc = readJson("mods/demo-mod.json") as Record<string, unknown>;
    const mod = loadContentPack("demo-mod", modDoc, { partial: true });
    const merged = mergePacks(base, mod);
    expect(merged.building("solar-array-25kw").powerKw).toBe(25);
    expect(merged.buildings.length).toBe(base.buildings.length + 1);

    const map = loadMap(merged.maps[0] as (typeof merged.maps)[number]);
    const world = createWorld(createGameDef(merged, map), {
      seed: 7,
      config: { startPhase: 2, startBudgetUsd: 1e9 },
    });
    world.enqueueCommand("cmd-place-building", { defId: "solar-array-25kw", x: 10, y: 10 });
    world.run(24);
    expect(world.store("building").size).toBe(1);
  });
});
