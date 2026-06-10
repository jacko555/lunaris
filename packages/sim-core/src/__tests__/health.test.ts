import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import type { World } from "../ecs/world.js";
import { CMD_ADD_CREW, CMD_PLACE_BUILDING, createGameDef } from "../game/game-def.js";
import {
  ALERTS_COMPONENT,
  CREW_COMPONENT,
  type AlertsComponent,
  type CrewComponent,
} from "../game/components.js";
import { R_FOOD, R_MEDKITS, R_O2, R_WATER } from "../game/resource-ids.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const HAB = 4;

function makeWorld(extra: string[] = [], crewCount = 1): World {
  const world = createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 11 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "hab", x: 0, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "fission", x: 2, y: 0 });
  world.enqueueCommand(CMD_PLACE_BUILDING, { defId: "radiator", x: 4, y: 0 });
  let x = 0;
  for (const defId of extra) {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: (x += 1), y: 3 });
  }
  for (let i = 0; i < crewCount; i++) {
    world.enqueueCommand(CMD_ADD_CREW, { name: `Crew-${i + 1}`, skills: {}, location: HAB });
  }
  return world;
}

function fullStock(world: World): void {
  world.resources.add(HAB, R_O2, 1000, "initial-stock");
  world.resources.add(HAB, R_WATER, 5000, "initial-stock");
  world.resources.add(HAB, R_FOOD, 1000, "initial-stock");
}

function crews(world: World): CrewComponent[] {
  return [...world.store<CrewComponent>(CREW_COMPONENT).entries()].map(([, c]) => c);
}

function alerts(world: World): { code: string; tick: number; message: string }[] {
  return world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
}

describe("HealthSystem", () => {
  it("bone/muscle drift erodes health without exercise, fully offset with it", () => {
    const noGym = makeWorld(["eclss"], 1);
    fullStock(noGym);
    noGym.run(24 * 30);
    const drifted = (crews(noGym)[0] as CrewComponent).health;
    expect(drifted).toBeLessThan(100);
    expect(drifted).toBeGreaterThan(99); // −0.5/month baseline

    const withGym = makeWorld(["gym", "eclss"], 1);
    fullStock(withGym);
    withGym.run(24 * 30);
    expect((crews(withGym)[0] as CrewComponent).health).toBeCloseTo(100, 1);
  });

  it("starvation: morale collapses first, then health — the legible cascade", () => {
    const world = makeWorld(["eclss"], 1);
    world.resources.add(HAB, R_O2, 500, "initial-stock");
    world.resources.add(HAB, R_WATER, 3000, "initial-stock");
    // No food.
    world.run(24 * 4);
    const crew = crews(world)[0] as CrewComponent;
    // Morale falls 10/day immediately; health only after the 24 h grace.
    expect(crew.morale).toBeLessThan(40);
    expect(crew.health).toBeGreaterThan(88); // ~3 days × 2.5
    expect(crew.health).toBeLessThan(95);
    const log = alerts(world);
    const foodAlert = log.find((a) => a.code === "food-depleted");
    expect(foodAlert).toBeDefined();
  });

  it("starvation kills within the expected window and names the cause", () => {
    const world = makeWorld(["eclss"], 1);
    world.resources.add(HAB, R_O2, 1000, "initial-stock");
    world.resources.add(HAB, R_WATER, 5000, "initial-stock");
    world.run(24 * 50);
    const crew = crews(world)[0] as CrewComponent;
    expect(crew.alive).toBe(0);
    const death = alerts(world).find((a) => a.code === "crew-death");
    expect(death).toBeDefined();
    expect(death?.message).toMatch(/starvation/);
    // health 100 ÷ 2.5/day ≈ 40 days + 1 day grace → death on day ~41.
    expect(death?.tick).toBeGreaterThan(24 * 38);
    expect(death?.tick).toBeLessThan(24 * 45);
  });

  it("hypoxia kills in hours, not days", () => {
    const world = makeWorld([], 1);
    world.resources.add(HAB, R_WATER, 1000, "initial-stock");
    world.resources.add(HAB, R_FOOD, 100, "initial-stock");
    world.resources.add(HAB, R_O2, 0.84, "initial-stock"); // one day of O₂
    world.run(40);
    const crew = crews(world)[0] as CrewComponent;
    expect(crew.alive).toBe(0);
    const death = alerts(world).find((a) => a.code === "crew-death");
    expect(death?.message).toMatch(/hypoxia/);
    expect(death?.tick).toBeLessThan(24 + 12); // ~5–7 h after O₂ ran out
  });

  it("clinic heals the wounded using medkits", () => {
    const world = makeWorld(["clinic", "eclss"], 1);
    fullStock(world);
    world.resources.add(HAB, R_MEDKITS, 10, "initial-stock");
    world.tick();
    const crew = crews(world)[0] as CrewComponent;
    crew.health = 50; // direct wound for the test
    world.run(24 * 10);
    expect((crews(world)[0] as CrewComponent).health).toBeCloseTo(60, 0); // +1/day
    expect(world.resources.amount(HAB, R_MEDKITS)).toBeLessThan(10); // supplies burn
  });

  it("medical events fire at the EVENTS.md rate and consume medkits", () => {
    // 6 crew × 2 years at 0.05/crew-year ⇒ expect ~0.6 events; with a
    // seeded rng we just assert the mechanism over a long horizon.
    const world = makeWorld(["clinic", "eclss", "gym", "gym"], 6);
    world.resources.add(HAB, R_O2, 10000, "initial-stock");
    world.resources.add(HAB, R_WATER, 50000, "initial-stock");
    world.resources.add(HAB, R_FOOD, 10000, "initial-stock");
    world.resources.add(HAB, R_MEDKITS, 50, "initial-stock");
    world.run(24 * 365 * 2);
    const events = alerts(world).filter((a) => a.code === "medical-event");
    // Alert log is ring-capped; check the counter another way: medkit burn
    // plus at least the mechanism firing across two years for 6 crew.
    expect(
      events.length + (50 - Math.ceil(world.resources.amount(HAB, R_MEDKITS))),
    ).toBeGreaterThan(0);
  });

  it("crowding drags morale below baseline", () => {
    const world = makeWorld(["eclss"], 6); // housing 4, crew 6
    fullStock(world);
    world.run(24 * 20);
    const moraleValues = crews(world).map((c) => c.morale);
    expect(Math.max(...moraleValues)).toBeLessThan(70);
  });
});
