import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { GameEvent } from "../schema/items.js";
import type { EntityId, JsonObject } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  PHASE_COMPONENT,
  type BuildingComponent,
  type PendingHazardComponent,
  type PhaseComponent,
} from "../game/components.js";
import { colonyConsume } from "../game/pool.js";
import { R_SPARE_PARTS } from "../game/resource-ids.js";
import { applySpeDose } from "./radiation.js";
import { isUnlocked } from "./reactions.js";

/**
 * Hazard engine v0 (TASKS.md M4, docs/EVENTS.md). Each event def carries
 * ideal/realistic annual rates (mode from world config.failureTables);
 * draws come deterministically from the world RNG in sorted event-id
 * order. Events with warningTicks spawn a pending hazard and a warning
 * alert with the ETA and counterplay (EVENTS.md design rule 1); the rest
 * impact immediately. space_weather_forecasting stretches SPE leads to
 * the maximum of the def's range.
 *
 * Also owns continuous equipment wear (wearRatePerYear, ×1.5 in Realistic
 * per the EVENTS MTBF note, doubled-rate under heavy dust for moving
 * parts) and the spare-parts auto-repair loop (ECONOMY.md maintenance
 * sink).
 */

export interface HazardSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

function failureMode(world: World): "ideal" | "realistic" {
  const config = world.config;
  if (config !== null && typeof config === "object" && !Array.isArray(config)) {
    if ((config as JsonObject)["failureTables"] === "realistic") {
      return "realistic";
    }
  }
  return "ideal";
}

export function createHazardSystem(pack: ContentPack, ids: HazardSystemIds): System {
  const wearRealisticFactor = 1.5;
  const repairKgPerPoint = pack.number("repair_parts_kg_per_point");
  const repairPointsPerDay = pack.number("repair_points_per_day");

  const applyEffects = (world: World, event: GameEvent): void => {
    const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
    for (const effect of event.effects) {
      const type = effect["type"] as string;
      if (type === "radiation-dose") {
        const range = effect["mSv"] as [number, number];
        const dose = range[0] + world.rng.next() * (range[1] - range[0]);
        applySpeDose(world, pack, { alertsEntity: ids.alertsEntity }, Math.round(dose));
      } else if (type === "building-damage") {
        const ids2 = buildings.entities();
        if (ids2.length > 0) {
          const target = ids2[world.rng.nextInt(0, ids2.length - 1)] as number;
          const building = buildings.require(target);
          const range = (effect["conditionLoss"] as [number, number] | undefined) ?? [0.01, 0.1];
          const loss = range[0] + world.rng.next() * (range[1] - range[0]);
          building.condition = Math.max(0, building.condition - loss);
          pushAlert(
            world,
            ids.alertsEntity,
            "warning",
            event.id,
            `${pack.building(building.defId).name} damaged (−${(loss * 100).toFixed(0)}% condition) by ${event.id} — repair consumes spare parts`,
          );
        }
      } else if (type === "structural-stress") {
        for (const [, building] of buildings.entries()) {
          if (world.rng.chance(0.3)) {
            building.condition = Math.max(0, building.condition - 0.02);
          }
        }
        pushAlert(
          world,
          ids.alertsEntity,
          "warning",
          event.id,
          "Shallow moonquake — structural stress check across the base (minor wear; printed/rigid structures shrug it off)",
        );
      } else if (type === "power-outage") {
        const ticksRange = (effect["ticks"] as [number, number] | undefined) ?? [24, 72];
        const ticks = world.rng.nextInt(ticksRange[0], ticksRange[1]);
        for (const [, building] of buildings.entries()) {
          if (pack.building(building.defId).powerKw >= 40) {
            building.offlineUntilTick = world.tickCount + ticks;
          }
        }
        pushAlert(
          world,
          ids.alertsEntity,
          "critical",
          event.id,
          `Fission scram — reactor offline for ${ticks} h. Check storage and shed industry tiers; pray it is daytime.`,
        );
      }
    }
  };

  return {
    name: "hazards",
    update: (world) => {
      const mode = failureMode(world);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const pendings = world.store<PendingHazardComponent>(PENDING_HAZARD_COMPONENT);
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).get(ids.colonyEntity);

      // ── resolve pending hazards ──
      for (const [entity, pending] of pendings.entries()) {
        if (world.tickCount >= pending.impactTick) {
          applyEffects(world, pack.event(pending.eventId));
          world.destroyEntity(entity);
        }
      }

      // ── roll new events (sorted id order = deterministic draws) ──
      for (const event of pack.events) {
        const minPhase = (event.conditions["minPhase"] as number | undefined) ?? 0;
        if (phase !== undefined && phase.phase < minPhase) {
          continue;
        }
        const ratePerYear = mode === "realistic" ? event.rates.realistic : event.rates.ideal;
        if (!world.rng.chance(ratePerYear / 8760)) {
          continue;
        }
        if (event.warningTicks !== undefined) {
          const maxLead = event.warningTicks[1];
          let minLead = event.warningTicks[0];
          if (isUnlocked(world, ids.colonyEntity, "space_weather_forecasting")) {
            minLead = maxLead;
          }
          const lead = world.rng.nextInt(minLead, maxLead);
          const entity = world.createEntity();
          pendings.set(entity, { eventId: event.id, impactTick: world.tickCount + lead });
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            `${event.id}-warning`,
            (event.alertTemplate ?? `${event.id} inbound (ETA {eta} h)`).replace(
              "{eta}",
              String(lead),
            ),
          );
        } else {
          applyEffects(world, event);
        }
      }

      // ── continuous wear + spare-parts repair ──
      const wearFactor = mode === "realistic" ? wearRealisticFactor : 1;
      let repairBudget = repairPointsPerDay / 24;
      for (const [entity, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (building.condition <= 0) {
          continue;
        }
        let wearPerTick = (def.wearRatePerYear / 8760) * wearFactor;
        if (def.mining !== undefined || def.reactions.length > 0) {
          // Moving parts grind faster under dust (EVENTS.md).
          const dust = world.store<{ frac: number }>("dust").get(entity);
          wearPerTick *= 1 + (dust?.frac ?? 0);
        }
        building.condition = Math.max(0, building.condition - wearPerTick);

        // Auto-repair from spare parts, worst-first via entity order.
        if (repairBudget > 0 && building.condition < 0.98) {
          const points = Math.min(repairBudget, 1 - building.condition);
          const partsNeeded = points * repairKgPerPoint;
          const partsGot = colonyConsume(world, R_SPARE_PARTS, partsNeeded, "maintenance");
          const repaired = partsGot / repairKgPerPoint;
          building.condition = Math.min(1, building.condition + repaired);
          repairBudget -= repaired;
        }
      }
    },
  };
}
