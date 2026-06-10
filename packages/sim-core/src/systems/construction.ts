import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { Building } from "../schema/items.js";
import type { EntityId } from "../types.js";
import { inBounds, tileAt, type LunarMap } from "../map/tiles.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  RESEARCH_COMPONENT,
  SITE_COMPONENT,
  STORAGE_COMPONENT,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type ResearchComponent,
  type SiteComponent,
  type StorageComponent,
  type ThermalComponent,
} from "../game/components.js";
import { colonyAmount, colonyConsume } from "../game/pool.js";

/**
 * Construction system (TASKS.md M4): queued builds consume their material
 * recipe (imported machine-components, or the local printed-regolith
 * recipe at the ECONOMY.md 60–80% mass discount baked into the data), then
 * progress at construction_hours_per_tonne. Completion instantiates the
 * building exactly as instant placement would. Regolith works are ordinary
 * buildings: berms add shielding to adjacent structures (read by the
 * radiation/SPE paths), printed landing pads damp landing dust (dust
 * system).
 */

export interface ConstructionSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export interface PlacementProblem {
  reason: string;
}

/** Shared placement validation (instant placement + build queue + UI). */
export function validatePlacement(
  world: World,
  pack: ContentPack,
  map: LunarMap,
  defId: string,
  x: number,
  y: number,
  colonyEntity: EntityId,
): PlacementProblem | null {
  let def: Building;
  try {
    def = pack.building(defId);
  } catch {
    return { reason: "unknown building" };
  }
  if (!inBounds(map, x, y)) {
    return { reason: "outside the map" };
  }
  const tile = tileAt(map, x, y);
  if (def.placement.requiresPSR && tile.illumClass !== "C") {
    return { reason: "requires a permanently shadowed tile" };
  }
  if (!def.placement.terrain.includes(tile.regolith)) {
    return { reason: `needs ${def.placement.terrain.join(" or ")} terrain` };
  }
  if (tile.slopeDeg > def.placement.maxSlope) {
    return { reason: `slope ${tile.slopeDeg}° exceeds maximum ${def.placement.maxSlope}°` };
  }
  if (def.techRequired !== null) {
    const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).get(colonyEntity);
    if (research === undefined || !research.unlocked.includes(def.techRequired)) {
      return { reason: `requires researching '${def.techRequired}'` };
    }
  }
  return null;
}

/** Instantiate a finished building (shared by instant placement + completion). */
export function instantiateBuilding(
  world: World,
  pack: ContentPack,
  defId: string,
  x: number,
  y: number,
): EntityId {
  const def = pack.building(defId);
  const entity = world.createEntity();
  world.store<BuildingComponent>(BUILDING_COMPONENT).set(entity, {
    defId,
    x,
    y,
    condition: 1,
    poweredFraction: 0,
    offlineUntilTick: 0,
  });
  if (def.heatKw > 0 || def.powerKw < 0) {
    world.store<ThermalComponent>(THERMAL_COMPONENT).set(entity, {
      tempK: pack.number("temp_internal_target"),
      state: "nominal",
      heaterRequestKw: 0,
      heaterDeliveredKw: 0,
    });
  }
  if (def.storageKwh !== undefined) {
    world.store<StorageComponent>(STORAGE_COMPONENT).set(entity, { energyKwh: def.storageKwh });
  }
  return entity;
}

/** Pick the affordable recipe, preferring local materials (make-vs-buy). */
function chooseRecipe(world: World, def: Building): "local" | "imported" | null {
  const affordable = (entries: { resource: string; kg: number }[]): boolean =>
    entries.length > 0 && entries.every((e) => colonyAmount(world, e.resource) >= e.kg);
  if (affordable(def.buildCost.local)) {
    return "local";
  }
  if (affordable(def.buildCost.imported)) {
    return "imported";
  }
  if (def.buildCost.local.length === 0 && def.buildCost.imported.length === 0) {
    return "imported"; // costless structure (test fixtures, scripted scenarios)
  }
  return null;
}

export function createConstructionSystem(pack: ContentPack, ids: ConstructionSystemIds): System {
  return {
    name: "construction",
    update: (world) => {
      const sites = world.store<SiteComponent>(SITE_COMPONENT);
      for (const [entity, site] of sites.entries()) {
        const def = pack.building(site.defId);

        if (site.paid === 0) {
          const recipe = chooseRecipe(world, def);
          if (recipe === null) {
            continue; // waiting on materials; the queue alert fired at enqueue
          }
          for (const entry of def.buildCost[recipe]) {
            colonyConsume(world, entry.resource, entry.kg, `construction-${site.defId}`);
          }
          site.recipe = recipe;
          site.paid = 1;
        }

        site.progressHours += 1;
        if (site.progressHours >= site.totalHours) {
          world.destroyEntity(entity);
          const built = instantiateBuilding(world, pack, site.defId, site.x, site.y);
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "construction-complete",
            `${def.name} construction complete (${site.recipe} materials, entity ${built})`,
          );
        }
      }
    },
  };
}

/** Σ shielding bonus from berm-class structures adjacent to a building. */
export function adjacentBermShielding(
  world: World,
  pack: ContentPack,
  building: BuildingComponent,
): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  const def = pack.building(building.defId);
  const [w, h] = def.footprint;
  let bonus = 0;
  for (const [, other] of buildings.entries()) {
    if (other === building) {
      continue;
    }
    const otherDef = pack.building(other.defId);
    if (!otherDef.shieldingAura || otherDef.shieldingGcm2 <= 0) {
      continue;
    }
    const [ow, oh] = otherDef.footprint;
    const adjacent =
      other.x <= building.x + w &&
      other.x + ow >= building.x &&
      other.y <= building.y + h &&
      other.y + oh >= building.y;
    if (adjacent) {
      bonus += otherDef.shieldingGcm2;
    }
  }
  return bonus;
}
