import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import { RESUPPLY_COMPONENT, type ResupplyComponent } from "../game/components.js";

/**
 * Logistics v0 (TASKS.md M3): scheduled Earth cargo missions deliver their
 * manifest into the target building's store at the arrival tick; repeating
 * missions reschedule themselves. Cost = Σ kg × the heavy-lift $/kg tier
 * (cost_per_kg_surface.heavy), recorded per mission. Launch windows,
 * transit modeling, vehicle classes, and failure probabilities arrive with
 * M4/M5 (docs/SDD.md §8).
 */

export interface LogisticsSystemIds {
  alertsEntity: EntityId;
}

/** $/kg for v0 missions (heavy-lift class). */
export function importCostPerKg(pack: ContentPack): number {
  const tiers = pack.constant("cost_per_kg_surface").value;
  if (typeof tiers === "number") {
    return tiers;
  }
  return tiers["heavy"] as number;
}

export function createLogisticsSystem(ids: LogisticsSystemIds): System {
  return {
    name: "logistics",
    update: (world) => {
      const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
      for (const [entity, mission] of missions.entries()) {
        if (world.tickCount < mission.arrivalTick) {
          continue;
        }
        let totalKg = 0;
        for (const entry of mission.manifest) {
          world.resources.add(mission.targetEntity, entry.resource, entry.kg, "earth-resupply");
          totalKg += entry.kg;
        }
        mission.deliveries += 1;
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "cargo-landed",
          `Cargo lander down: ${totalKg.toFixed(0)} kg delivered ($${(mission.costUsd / 1e6).toFixed(1)}M landed cost)`,
        );
        if (mission.repeatTicks > 0) {
          mission.arrivalTick += mission.repeatTicks;
        } else {
          world.destroyEntity(entity);
        }
      }
    },
  };
}
