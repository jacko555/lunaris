import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { ENVIRONMENT_COMPONENT, type EnvironmentComponent } from "../game/components.js";

/**
 * EnvironmentSystem (docs/SDD.md §2): lunar epoch clock over the 29.53-day
 * synodic cycle, illumination per tile class, and the surface temperature
 * sinusoid lagged ~2 ticks behind illumination.
 *
 * Phase convention: 0 = dawn for class-B (standard polar) tiles, so
 * [0, 0.5) is the lunar day and [0.5, 1) the night. Class-A eternal-light
 * ridge tiles see one clustered eclipse window of 10% of the cycle in
 * mid-night (lit fraction 0.90); class-C PSR tiles are never lit and sit
 * pinned at temp_psr.
 */

/** Class-A tiles are dark only during [0.70, 0.80) of the cycle. */
export const CLASS_A_ECLIPSE_START = 0.7;
export const CLASS_A_ECLIPSE_END = 0.8;

const TEMP_LAG_TICKS = 2;

export function createEnvironmentSystem(pack: ContentPack, envEntity: EntityId): System {
  const ticksPerLunarDay = pack.number("day_synodic") * 24;
  const tempDayMaxK = pack.number("temp_day_max");
  const tempNightMinK = pack.number("temp_night_min");
  const tempPsrK = pack.number("temp_psr");
  const midK = (tempDayMaxK + tempNightMinK) / 2;
  const ampK = (tempDayMaxK - tempNightMinK) / 2;
  const lagPhase = TEMP_LAG_TICKS / ticksPerLunarDay;

  return {
    name: "environment",
    update: (world) => {
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(envEntity);
      const phase = (world.tickCount % ticksPerLunarDay) / ticksPerLunarDay;
      const litB = phase < 0.5 ? 1 : 0;
      const litA = phase >= CLASS_A_ECLIPSE_START && phase < CLASS_A_ECLIPSE_END ? 0 : 1;
      // Peak at solar noon (phase 0.25) plus the thermal lag, floor at night.
      const tempSurfaceK = Math.min(
        tempDayMaxK,
        Math.max(tempNightMinK, midK + ampK * Math.sin(2 * Math.PI * (phase - lagPhase))),
      );
      env.lunarPhase = phase;
      env.tempSurfaceK = tempSurfaceK;
      env.tempPsrK = tempPsrK;
      env.litA = litA;
      env.litB = litB;
      env.litC = 0;
      env.isNight = 1 - litB;
    },
  };
}
