import { describe, expect, it } from "vitest";
import { createWorld } from "../save.js";
import { createGameDef, ENV_ENTITY } from "../game/game-def.js";
import { ENVIRONMENT_COMPONENT, type EnvironmentComponent } from "../game/components.js";
import { makeTestMap, makeTestPack } from "./fixtures.js";

const TICKS_PER_LUNAR_DAY = 29.53 * 24; // 708.72

function makeWorld() {
  return createWorld(createGameDef(makeTestPack(), makeTestMap()), { seed: 1 });
}

function env(world: ReturnType<typeof makeWorld>): EnvironmentComponent {
  return world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
}

describe("EnvironmentSystem", () => {
  it("tracks the 29.53-day synodic cycle and wraps", () => {
    const world = makeWorld();
    world.tick();
    expect(env(world).lunarPhase).toBeCloseTo(0, 5);
    world.run(354); // ~half a cycle
    expect(env(world).lunarPhase).toBeCloseTo(354 / TICKS_PER_LUNAR_DAY, 5);
    world.run(355); // past one full cycle
    expect(env(world).lunarPhase).toBeLessThan(0.01);
  });

  it("gives illumination fractions of ~0.9 (A), 0.5 (B), 0 (C) over a full cycle", () => {
    const world = makeWorld();
    let litA = 0;
    let litB = 0;
    let litC = 0;
    const ticks = 709;
    for (let t = 0; t < ticks; t++) {
      world.tick();
      litA += env(world).litA;
      litB += env(world).litB;
      litC += env(world).litC;
    }
    expect(litA / ticks).toBeCloseTo(0.9, 1);
    expect(litB / ticks).toBeCloseTo(0.5, 1);
    expect(litC).toBe(0);
  });

  it("clusters the class-A eclipse inside the class-B night", () => {
    const world = makeWorld();
    for (let t = 0; t < 709; t++) {
      world.tick();
      if (env(world).litA === 0) {
        expect(env(world).litB).toBe(0);
      }
    }
  });

  it("keeps surface temperature within [100, 400] K, hot by day and cold by night", () => {
    const world = makeWorld();
    let dayMax = -Infinity;
    let nightMin = Infinity;
    for (let t = 0; t < 709; t++) {
      world.tick();
      const e = env(world);
      expect(e.tempSurfaceK).toBeGreaterThanOrEqual(100);
      expect(e.tempSurfaceK).toBeLessThanOrEqual(400);
      if (e.litB === 1) {
        dayMax = Math.max(dayMax, e.tempSurfaceK);
      } else {
        nightMin = Math.min(nightMin, e.tempSurfaceK);
      }
      expect(e.tempPsrK).toBe(40);
    }
    expect(dayMax).toBeGreaterThan(390);
    expect(nightMin).toBeLessThan(110);
  });

  it("lags the temperature peak ~2 ticks behind solar noon", () => {
    const world = makeWorld();
    let peakTick = 0;
    let peakTemp = -Infinity;
    for (let t = 0; t < 709; t++) {
      world.tick();
      if (env(world).tempSurfaceK > peakTemp) {
        peakTemp = env(world).tempSurfaceK;
        peakTick = t;
      }
    }
    const noonTick = Math.round(TICKS_PER_LUNAR_DAY * 0.25);
    expect(peakTick).toBeGreaterThan(noonTick);
    expect(peakTick).toBeLessThanOrEqual(noonTick + 4);
  });
});
