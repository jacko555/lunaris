import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  RESEARCH_COMPONENT,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type ResearchComponent,
  type ThermalComponent,
} from "../game/components.js";
import { colonyConsume } from "../game/pool.js";
import { R_REGOLITH, R_WATER_ICE } from "../game/resource-ids.js";

/**
 * Reaction processor framework (TASKS.md M4, docs/ECONOMY.md chains).
 *
 * Mining buildings excavate their own tile: yield splits into water-ice ×
 * tile iceFrac plus regolith × (1 − iceFrac) — "ice mining yield = tile ice
 * concentration". Hosted reactions run at the building's declared
 * primary-output rate, throttled by duty = poweredFraction × condition ×
 * staffing, gated by reaction minTempK against the building's internal
 * temperature, and scaled down to whatever inputs are actually available.
 * Ground-sourced inputs (regolith) are drawn freely from the tile with a
 * declared source; everything else comes from the colony pool. Vented loss
 * is simply not materialized — the ledger sees inputs (sink) vs outputs
 * (source) and the books still balance.
 *
 * Staffing (SDD §9): all crewOps skills present among living crew → 1;
 * otherwise the automation floor (0.5, raised to 0.8 by automation_robotics).
 */

export interface ReactionSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function isUnlocked(world: World, colonyEntity: EntityId, techId: string): boolean {
  const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).get(colonyEntity);
  return research !== undefined && research.unlocked.includes(techId);
}

export function staffedFactor(
  world: World,
  pack: ContentPack,
  colonyEntity: EntityId,
  defId: string,
): number {
  const crewOps = pack.building(defId).crewOps;
  const skills = Object.keys(crewOps);
  if (skills.length === 0) {
    return 1;
  }
  const crews = world.store<CrewComponent>(CREW_COMPONENT);
  const available = new Set<string>();
  for (const [, crew] of crews.entries()) {
    if (crew.alive !== 1) {
      continue;
    }
    for (const skill of Object.keys(crew.skills)) {
      if ((crew.skills[skill] ?? 0) > 0) {
        available.add(skill);
      }
    }
  }
  if (skills.every((skill) => available.has(skill))) {
    return 1;
  }
  return isUnlocked(world, colonyEntity, "automation_robotics") ? 0.8 : 0.5;
}

/** Days of crew consumables industry may never touch (SDD: LSS priority). */
const LSS_RESERVE_DAYS = 5;

export function createReactionSystem(
  pack: ContentPack,
  map: LunarMap,
  ids: ReactionSystemIds,
): System {
  const waterPerCrewDay =
    pack.number("crew_water_potable_day") + pack.number("crew_hygiene_water_day");
  const o2PerCrewDay = pack.number("crew_o2_day");
  return {
    name: "reactions",
    update: (world) => {
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);

      // Life-support reserve: industrial reactions (electrolysis, LOX
      // liquefaction) must leave the crew several days of water and O₂ —
      // otherwise a propellant plant drinks every delivery to zero and
      // settlers die of thirst on a base that exports water by the tonne.
      let living = 0;
      for (const [, crew] of world.store<CrewComponent>(CREW_COMPONENT).entries()) {
        if (crew.alive === 1) {
          living++;
        }
      }
      const reserveKg: Record<string, number> = {
        water: living * waterPerCrewDay * LSS_RESERVE_DAYS,
        "o2-gas": living * o2PerCrewDay * LSS_RESERVE_DAYS,
      };

      for (const [entity, building] of buildings.entries()) {
        if (building.condition <= 0 || world.tickCount < building.offlineUntilTick) {
          continue;
        }
        const def = pack.building(building.defId);
        if (def.mining === undefined && def.reactions.length === 0) {
          continue;
        }
        const duty =
          building.poweredFraction *
          building.condition *
          staffedFactor(world, pack, ids.colonyEntity, building.defId);
        if (duty <= 0) {
          continue;
        }

        // ── mining: excavate the building's own tile ──
        if (def.mining !== undefined) {
          const tile = tileAt(map, building.x, building.y);
          const minedKg = (def.mining.kgPerDay / 24) * duty;
          const iceKg = minedKg * tile.iceFrac;
          const regolithKg = minedKg - iceKg;
          if (iceKg > 0) {
            world.resources.add(entity, R_WATER_ICE, iceKg, "mining-ice");
          }
          if (regolithKg > 0) {
            world.resources.add(entity, R_REGOLITH, regolithKg, "mining-regolith");
          }
        }

        // ── hosted reactions ──
        const thermal = thermals.get(entity);
        for (const rid of def.reactions) {
          const reaction = pack.reaction(rid);
          if (
            reaction.minTempK !== undefined &&
            thermal !== undefined &&
            thermal.tempK < reaction.minTempK
          ) {
            continue;
          }
          const ratedPrimaryKg = ((def.reactionKgPerDay[rid] as number) / 24) * duty;
          if (ratedPrimaryKg <= 0) {
            continue;
          }
          const primaryEntry = reaction.outputs.find((o) => o.resource === reaction.primaryOutput);
          const primaryPerBatch = (primaryEntry as { kg: number }).kg;

          // Scale by the scarcest non-ground input.
          let batches = ratedPrimaryKg / primaryPerBatch;
          for (const input of reaction.inputs) {
            if (pack.resource(input.resource).groundSourced) {
              continue;
            }
            const reserved = reserveKg[input.resource] ?? 0;
            const availableBatches =
              Math.max(0, colonyAvailable(world, input.resource) - reserved) / input.kg;
            batches = Math.min(batches, availableBatches);
          }
          if (batches <= 0) {
            continue;
          }

          // Availability was pre-checked synchronously above, so each draw
          // is guaranteed; consuming exactly `batches` keeps stoichiometry.
          for (const input of reaction.inputs) {
            const kg = input.kg * batches;
            if (pack.resource(input.resource).groundSourced) {
              // Scooped from the tile, then immediately consumed: declare
              // both legs so the books stay explicit.
              world.resources.add(entity, input.resource, kg, "regolith-excavation");
            }
            colonyConsume(world, input.resource, kg, `reaction-${rid}`);
          }
          for (const output of reaction.outputs) {
            const kg = output.kg * batches;
            if (kg > 0) {
              world.resources.add(entity, output.resource, kg, `reaction-${rid}`);
            }
          }
          // ventedLossKg × batches simply isn't materialized.
        }
      }
    },
  };
}

function colonyAvailable(world: World, resource: string): number {
  const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
  let total = 0;
  for (const entity of buildings.entities()) {
    total += world.resources.amount(entity, resource);
  }
  return total;
}
