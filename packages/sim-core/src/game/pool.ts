import type { World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { BUILDING_COMPONENT, type BuildingComponent } from "./components.js";

/**
 * Colony-pool resource helpers (M3 simplification, noted in SDD §6): all
 * building stores form one logistics pool, drawn in ascending entity order
 * so every operation is deterministic. Per-habitat atmospheres and surface
 * transport arrive with EVA/airlock mechanics in later milestones.
 *
 * "Atmosphere" is the subset held by crewed-volume buildings (those with
 * housing or shelter services) — exhaled CO₂ lives there until a scrubber
 * concentrates it into its own machine store.
 */

export function colonyAmount(world: World, resource: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let total = 0;
  for (const entity of buildings.entities()) {
    total += world.resources.amount(entity, resource);
  }
  return total;
}

/** Destroy up to kg from the pool with a declared sink; returns the amount taken. */
export function colonyConsume(world: World, resource: string, kg: number, sink: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let remaining = kg;
  for (const entity of buildings.entities()) {
    if (remaining <= 0) {
      break;
    }
    remaining -= world.resources.removeUpTo(entity, resource, remaining, sink);
  }
  return kg - remaining;
}

/** Move up to kg from the pool into one entity's store; returns the amount moved. */
export function colonyTransferTo(
  world: World,
  target: EntityId,
  resource: string,
  kg: number,
): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let remaining = kg;
  for (const entity of buildings.entities()) {
    if (remaining <= 0) {
      break;
    }
    if (entity === target) {
      continue;
    }
    const available = world.resources.amount(entity, resource);
    const take = Math.min(available, remaining);
    if (take > 0) {
      world.resources.transfer(entity, target, resource, take);
      remaining -= take;
    }
  }
  return kg - remaining;
}

function isCrewedVolume(pack: ContentPack, building: BuildingComponent): boolean {
  const services = pack.building(building.defId).services;
  return (services.housing ?? 0) > 0 || (services.shelter ?? 0) > 0;
}

export function atmosphereAmount(world: World, pack: ContentPack, resource: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let total = 0;
  for (const [entity, building] of buildings.entries()) {
    if (isCrewedVolume(pack, building)) {
      total += world.resources.amount(entity, resource);
    }
  }
  return total;
}

/** Scrubbers pull from crewed volumes only; returns the amount moved to `target`. */
export function atmosphereTransferTo(
  world: World,
  pack: ContentPack,
  target: EntityId,
  resource: string,
  kg: number,
): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let remaining = kg;
  for (const [entity, building] of buildings.entries()) {
    if (remaining <= 0) {
      break;
    }
    if (entity === target || !isCrewedVolume(pack, building)) {
      continue;
    }
    const take = Math.min(world.resources.amount(entity, resource), remaining);
    if (take > 0) {
      world.resources.transfer(entity, target, resource, take);
      remaining -= take;
    }
  }
  return kg - remaining;
}
