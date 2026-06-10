import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import { CMD_ADD_CREW, CMD_PLACE_BUILDING, createGameDef } from "../game/game-def.js";
import { colonyAmount } from "../game/pool.js";
import {
  R_FOOD,
  R_LOX,
  R_O2,
  R_PRINTED,
  R_REGOLITH,
  R_SLAG,
  R_WATER,
  R_WATER_ICE,
} from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

/** Fixture map: column 7 is PSR with iceFrac 0.056; power from fission+radiator. */
function makeWorld(extra: [string, number, number][]): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 5 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 2, y: 2 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 0, y: 2 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 1, y: 2 });
  for (const [defId, x, y] of extra) {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x, y });
  }
  return world;
}

describe("ReactionSystem", () => {
  it("ice mining yield equals the tile ice concentration", () => {
    const world = makeWorld([["harvester", 7, 0]]); // PSR tile, ice 5.6 wt%
    world.run(24); // one day at 720 kg/day (unstaffed ×0.5 → 360 kg)
    const minedIce = colonyAmount(world, R_WATER_ICE);
    const minedRegolith = colonyAmount(world, R_REGOLITH);
    expect(minedIce + minedRegolith).toBeCloseTo(360, 1);
    expect(minedIce / (minedIce + minedRegolith)).toBeCloseTo(0.056, 3);
  });

  it("the full water chain runs: ice → water → O₂ + H₂ → LOX", () => {
    const world = makeWorld([
      ["harvester", 7, 0],
      ["oven", 4, 0],
      ["electro", 4, 2],
      ["cryo", 4, 4],
    ]);
    world.run(24 * 5);
    // Intermediates (water, O₂) are devoured by the next stage each tick —
    // the end product proves the whole chain ran. Conservation is
    // ledger-enforced every tick across all ~120 of them.
    expect(colonyAmount(world, R_LOX)).toBeGreaterThan(1);
    expect(colonyAmount(world, R_WATER_ICE)).toBeCloseTo(0, 3); // all melted
  });

  it("MRE pulls regolith from the ground and yields 28% O₂ plus slag", () => {
    const world = makeWorld([["mre-s", 4, 0]]);
    world.run(48);
    const o2 = colonyAmount(world, R_O2);
    const slag = colonyAmount(world, R_SLAG);
    expect(o2).toBeGreaterThan(0);
    expect(slag / o2).toBeCloseTo(30 / 28, 2); // SDD §7 mass split
    // Rate: 2.74 kg O₂/day × 0.5 unstaffed × 2 days.
    expect(o2).toBeCloseTo(2.74, 1);
  });

  it("staffing doubles throughput vs the unstaffed automation floor", () => {
    const unstaffed = makeWorld([["mre-s", 4, 0]]);
    unstaffed.run(48);

    const staffed = makeWorld([
      ["mre-s", 4, 0],
      ["hab", 0, 4],
      ["eclss", 2, 4],
    ]);
    // Buildings: fission 4,5 / radiators 6,7 / mre-s 8 / hab 9 / eclss 10.
    staffed.enqueueCommand(CMD_ADD_CREW, { name: "Eng", skills: { engineer: 2 }, location: 9 });
    staffed.resources.add(9, R_O2, 100, "initial-stock");
    staffed.resources.add(9, R_WATER, 500, "initial-stock");
    staffed.resources.add(9, R_FOOD, 50, "initial-stock");
    staffed.run(48);

    const o2Unstaffed = colonyAmount(unstaffed, R_O2);
    // Subtract the crew world's imported O₂ stock to compare production.
    const produced = colonyAmount(staffed, R_O2) - 100 + 2 * 0.84; // breathing drawn back out
    expect(produced).toBeGreaterThan(o2Unstaffed * 1.7);
  });

  it("the printer turns ground regolith into printed structure", () => {
    const world = makeWorld([["printer", 4, 0]]);
    world.run(24);
    expect(colonyAmount(world, R_PRINTED)).toBeCloseTo(150, 0); // 300/day × 0.5
  });

  it("reactions scale down to available inputs instead of overdrawing", () => {
    const world = makeWorld([["oven", 4, 0]]); // 320 kg/day cap, no ice supply
    world.resources.add(5, R_WATER_ICE, 3, "initial-stock"); // 3 kg only
    world.run(24);
    expect(colonyAmount(world, R_WATER)).toBeCloseTo(3, 6); // consumed exactly
    expect(colonyAmount(world, R_WATER_ICE)).toBeCloseTo(0, 6);
  });
});
