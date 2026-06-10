import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  DUST_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type DustComponent,
} from "../game/components.js";
import { isUnlocked } from "./reactions.js";

/**
 * Dust system (TASKS.md M4, EVENTS.md dust accumulation): EVA activity and
 * unpaved landings deposit dust on dust-sensitive buildings (solar output
 * × (1 − frac), read by PowerSystem); crew maintenance cleans it back.
 * A landing pad damps landing spikes by 90% (EVENTS.md); dust_mitigation
 * tech (EDS coatings) halves accumulation.
 */

export interface DustSystemIds {
  colonyEntity: EntityId;
}

/** Logistics calls this when a lander touches down. */
export function applyLandingDust(world: World, pack: ContentPack, colonyEntity: EntityId): void {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  const dusts = world.store<DustComponent>(DUST_COMPONENT);
  let hasPad = false;
  for (const [, building] of buildings.entries()) {
    if (pack.building(building.defId).landingPad && building.condition > 0) {
      hasPad = true;
      break;
    }
  }
  let spike = pack.number("dust_landing_spike");
  if (hasPad) {
    spike *= 1 - pack.number("dust_pad_mitigation");
  }
  if (isUnlocked(world, colonyEntity, "dust_mitigation")) {
    spike *= 0.5;
  }
  for (const [entity, building] of buildings.entries()) {
    if (pack.building(building.defId).dustSensitive) {
      const dust = dusts.get(entity) ?? { frac: 0 };
      dust.frac = Math.min(1, dust.frac + spike);
      dusts.set(entity, dust);
    }
  }
}

export function createDustSystem(pack: ContentPack, ids: DustSystemIds): System {
  const evaRatePerDay = pack.number("dust_solar_degradation_per_eva_day");
  const cleaningPerDay = pack.number("dust_cleaning_per_day");

  return {
    name: "dust",
    update: (world) => {
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const dusts = world.store<DustComponent>(DUST_COMPONENT);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);

      let evaCrew = 0;
      let livingCrew = 0;
      for (const [, crew] of crews.entries()) {
        if (crew.alive === 1) {
          livingCrew++;
          if (crew.eva === 1) {
            evaCrew++;
          }
        }
      }
      let accumulationPerTick = (evaRatePerDay / 24) * evaCrew;
      if (isUnlocked(world, ids.colonyEntity, "dust_mitigation")) {
        accumulationPerTick *= 0.5;
      }
      // Maintenance cleaning needs hands on site.
      const cleaningPerTick = livingCrew > 0 ? cleaningPerDay / 24 : 0;

      for (const [entity, building] of buildings.entries()) {
        if (!pack.building(building.defId).dustSensitive) {
          continue;
        }
        const dust = dusts.get(entity) ?? { frac: 0 };
        dust.frac = Math.max(0, Math.min(1, dust.frac + accumulationPerTick - cleaningPerTick));
        dusts.set(entity, dust);
      }
    },
  };
}
