import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { BUILDING_COMPONENT, type BuildingComponent } from "../game/components.js";
import { colonyConsume } from "../game/pool.js";
import { R_CO2, R_FOOD, R_O2, R_WATER } from "../game/resource-ids.js";

/**
 * Food production (TASKS.md M7, SDD §6 food chain). Farm buildings carry
 * `farm.areaM2`; capacity = area / crop_area_per_person (45 m² for a full
 * diet). Per person-day-equivalent of crops, photosynthesis closes mass
 * exactly: 1.00 kg CO₂ + 0.46 kg water → 0.62 kg dry food + 0.84 kg O₂
 * (the inverse of crew metabolism — crops are the other half of the loop).
 * LED energy is the building's powerKw (the dominant cost, per SDD);
 * throughput scales with duty and available CO₂/water. Partial farms scale
 * linearly. Crop variety/morale is read by HealthSystem via farmCoverage.
 */

export interface FoodSystemIds {
  colonyEntity: EntityId;
}

/** Fraction of living crew whose full diet current farms can grow (0–1+). */
export function farmCoverage(
  worldBuildings: Iterable<[EntityId, BuildingComponent]>,
  pack: ContentPack,
  livingCrew: number,
): number {
  const areaPerPerson = pack.number("crop_area_per_person");
  let persons = 0;
  for (const [, building] of worldBuildings) {
    const farm = pack.building(building.defId).farm;
    if (farm !== undefined) {
      persons += (farm.areaM2 / areaPerPerson) * building.poweredFraction * building.condition;
    }
  }
  return livingCrew > 0 ? persons / livingCrew : persons;
}

export function createFoodSystem(pack: ContentPack, ids: FoodSystemIds): System {
  void ids; // reserved for future alerting (crop-failure events)
  const areaPerPerson = pack.number("crop_area_per_person");

  return {
    name: "food",
    update: (world) => {
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      for (const [entity, building] of buildings.entries()) {
        const farm = pack.building(building.defId).farm;
        if (farm === undefined || building.condition <= 0) {
          continue;
        }
        const duty = building.poweredFraction * building.condition;
        if (duty <= 0) {
          continue;
        }
        const personsPerTick = ((farm.areaM2 / areaPerPerson) * duty) / 24;
        // Pre-check the scarcest input, then convert exactly (1.00 CO₂ +
        // 0.46 H₂O → 0.62 food + 0.84 O₂ per person-day equivalent).
        const limit = Math.min(
          personsPerTick,
          colonyAvailable(world, R_CO2) / 1.0,
          colonyAvailable(world, R_WATER) / 0.46,
        );
        if (limit <= 0) {
          continue;
        }
        colonyConsume(world, R_CO2, 1.0 * limit, "crop-photosynthesis");
        colonyConsume(world, R_WATER, 0.46 * limit, "crop-photosynthesis");
        world.resources.add(entity, R_FOOD, 0.62 * limit, "greenhouse");
        world.resources.add(entity, R_O2, 0.84 * limit, "greenhouse");
      }
    },
  };
}

function colonyAvailable(world: import("../ecs/world.js").World, resource: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let total = 0;
  for (const entity of buildings.entities()) {
    total += world.resources.amount(entity, resource);
  }
  return total;
}
