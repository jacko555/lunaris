import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import {
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  createGameDef,
} from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  DUST_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type DustComponent,
} from "../game/components.js";
import { R_FOOD, R_O2, R_SPARE_PARTS, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

function makeWorld(config: Record<string, unknown> = {}): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), {
    seed: 21,
    config: { startBudgetUsd: 1e9, startTechs: ["night_landing_nav"], ...config } as never,
  });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 2, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "solar", x: 4, y: 0 }); // dustSensitive? fixture solar has no flag…
  return world;
}

describe("DustSystem", () => {
  it("heavy EVA activity outpaces maintenance cleaning; light EVA does not", () => {
    const pack = makeTestPack();
    expect(pack.building("solar").dustSensitive).toBe(true);
    const run = (evaCrew: number): number => {
      const world = makeWorld();
      world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: 0, y: 4 });
      world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "eclss", x: 2, y: 4 });
      for (let i = 0; i < 4; i++) {
        world.enqueueCommand(CMD_ADD_CREW, { name: `C${i}`, skills: {}, location: 7 });
      }
      world.resources.add(7, R_O2, 500, "initial-stock");
      world.resources.add(7, R_WATER, 3000, "initial-stock");
      world.resources.add(7, R_FOOD, 300, "initial-stock");
      for (let i = 0; i < evaCrew; i++) {
        world.enqueueCommand(CMD_ASSIGN_CREW, { crew: 9 + i, eva: 1 }, 1);
      }
      world.run(24 * 10);
      // fission 4, radiator 5, solar 6
      return world.store<DustComponent>(DUST_COMPONENT).get(6)?.frac ?? 0;
    };
    // 4 EVA crew: 0.02/day accumulation vs 0.01/day cleaning → builds up.
    expect(run(4)).toBeGreaterThan(0.05);
    // 1 EVA crew: cleaning (0.01/day) wins → arrays stay clean.
    expect(run(1)).toBe(0);
  });

  it("an unpaved landing spikes dust; a pad damps it 90%", () => {
    // Three staggered cargo missions: individual landings can fail (2%
    // ideal), but with a fixed seed the outcomes are deterministic and at
    // least one touchdown is effectively guaranteed.
    const schedule = (world: ReturnType<typeof makeWorld>): void => {
      for (let i = 0; i < 3; i++) {
        world.enqueueCommand(
          CMD_SCHEDULE_RESUPPLY,
          {
            manifest: [{ resource: R_FOOD, kg: 100 }],
            arrivalTick: 0,
            targetEntity: 4,
            vehicle: "heavy",
          },
          i,
        );
      }
    };
    const unpaved = makeWorld();
    schedule(unpaved);
    unpaved.run(110);
    const dustUnpaved = unpaved.store<DustComponent>(DUST_COMPONENT).get(6)?.frac ?? 0;
    expect(dustUnpaved).toBeGreaterThan(0.04); // ≥1 landing × 0.05 spike

    const paved = makeWorld();
    paved.enqueueCommand(CMD_PLACE_BUILDING, { defId: "pad", x: 0, y: 3 });
    schedule(paved);
    paved.run(110);
    const dustPaved = paved.store<DustComponent>(DUST_COMPONENT).get(6)?.frac ?? 0;
    expect(dustPaved).toBeLessThan(dustUnpaved * 0.25);
  });
});

describe("HazardSystem", () => {
  it("rolls EVENTS.md hazards deterministically; realistic mode rolls more", () => {
    const countEvents = (config: Record<string, unknown>): number => {
      const world = makeWorld(config);
      let count = 0;
      let lastSeq = -1;
      for (let t = 0; t < 24 * 365; t++) {
        world.tick();
        const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3);
        for (const entry of alerts.entries) {
          if (
            entry.seq > lastSeq &&
            (entry.code === "micrometeorite" || entry.code === "moonquake")
          ) {
            count++;
          }
          lastSeq = Math.max(lastSeq, entry.seq);
        }
      }
      return count;
    };
    // Ideal: micrometeorite 0.5/yr + moonquake 0.2/yr ≈ 0.7 expected.
    // Realistic: 1 + 0.3 ≈ 1.3 expected. Deterministic given the seed.
    const ideal = countEvents({});
    const realistic = countEvents({ failureTables: "realistic" });
    expect(ideal + realistic).toBeGreaterThan(0);
    expect(realistic).toBeGreaterThanOrEqual(ideal);
  });

  it("equipment wear erodes condition; spare parts repair it", () => {
    // Fixture fission wears at 0.05/yr × 1.5 realistic ≈ 0.041 over 200 days.
    const noParts = makeWorld({ failureTables: "realistic" });
    noParts.run(24 * 200);
    const worn = (noParts.store<BuildingComponent>(BUILDING_COMPONENT).get(4) as BuildingComponent)
      .condition;
    expect(worn).toBeLessThan(0.97);

    const withParts = makeWorld({ failureTables: "realistic" });
    withParts.resources.add(4, R_SPARE_PARTS, 5000, "initial-stock");
    withParts.run(24 * 200);
    const repaired = (
      withParts.store<BuildingComponent>(BUILDING_COMPONENT).get(4) as BuildingComponent
    ).condition;
    expect(repaired).toBeGreaterThan(0.97); // maintenance holds the line
    expect(withParts.resources.amount(4, R_SPARE_PARTS)).toBeLessThan(5000); // parts burned
  });
});
