import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
} from "../game/components.js";
import {
  atmosphereAmount,
  atmosphereTransferTo,
  colonyAmount,
  colonyConsume,
} from "../game/pool.js";
import { R_CO2, R_FOOD, R_H2, R_O2, R_WASTEWATER, R_WATER } from "../game/resource-ids.js";
import { isUnlocked } from "./reactions.js";

/**
 * ECLSS system (docs/SDD.md §6). Per crew member per day (÷24 per tick):
 * O₂ −0.84 kg, CO₂ +1.00 kg, potable water −3.54 kg, hygiene water −3.5 kg,
 * dry food −0.62 kg; wastewater out ≈ water drawn (metabolic water closes
 * the difference). Machine passes, per powered ECLSS-equipped building in
 * entity order:
 *   scrubber  — pulls CO₂ from crewed volumes into its machine store
 *   OGA       — electrolyzes water → O₂ 0.89 / H₂ 0.11 toward a reserve
 *               target of o2_reserve_target_days of crew demand
 *   recycler  — wastewater × waterRecovery → potable; remainder = brine loss
 *   Sabatier  — CO₂ + 4H₂ → CH₄ + 2H₂O (mass 1 : 0.1818 → 0.3636 : 0.8182)
 *
 * Shortages increment per-crew accumulators (hunger/thirst/hypoxia/CO₂);
 * HealthSystem converts those into the legible damage cascade. Alerts fire
 * on shortage onset with cause + counterplay text (EVENTS.md design rule 1).
 */

export interface EclssSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createEclssSystem(pack: ContentPack, ids: EclssSystemIds): System {
  const o2PerTick = pack.number("crew_o2_day") / 24;
  const co2PerTick = pack.number("crew_co2_day") / 24;
  const potablePerTick = pack.number("crew_water_potable_day") / 24;
  const hygienePerTick = pack.number("crew_hygiene_water_day") / 24;
  const foodPerTick = pack.number("crew_food_dry_day") / 24;
  const o2ReserveDays = pack.number("o2_reserve_target_days");
  const co2WarningKgPerPerson = pack.number("co2_warning_kg_per_person");
  const co2DangerKgPerPerson = pack.number("co2_danger_kg_per_person");

  return {
    name: "eclss",
    update: (world) => {
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);

      // ── crew metabolism ──
      let living = 0;
      for (const [, crew] of crews.entries()) {
        if (crew.alive !== 1) {
          continue;
        }
        living++;

        const o2Got = colonyConsume(world, R_O2, o2PerTick, "crew-breathing");
        const o2Fraction = o2PerTick > 0 ? o2Got / o2PerTick : 1;
        if (o2Fraction < 0.999) {
          if (crew.hypoxiaHours === 0) {
            pushAlert(
              world,
              ids.alertsEntity,
              "critical",
              "o2-depleted",
              `${crew.name} is out of breathable O₂ — restore O₂ production or deliver tanks NOW`,
            );
          }
          crew.hypoxiaHours += 1;
        } else {
          crew.hypoxiaHours = 0;
        }
        if (o2Got > 0) {
          // Exhaled CO₂ enters the crew member's local volume.
          world.resources.add(crew.location, R_CO2, co2PerTick * o2Fraction, "crew-breathing");
        }

        const waterGot = colonyConsume(world, R_WATER, potablePerTick, "crew-consumption");
        colonyConsume(world, R_WATER, hygienePerTick, "crew-hygiene");
        if (waterGot < potablePerTick * 0.999) {
          if (crew.thirstHours === 0) {
            pushAlert(
              world,
              ids.alertsEntity,
              "critical",
              "water-depleted",
              `${crew.name} has no potable water — check the recycler and schedule a water delivery`,
            );
          }
          crew.thirstHours += 1;
        } else {
          crew.thirstHours = 0;
        }
        // Wastewater out ≈ all water drawn (urine + humidity + hygiene;
        // metabolic water from food closes the small gap — SDD §6).
        const wastewaterKg = waterGot + hygienePerTick * 0.98;
        if (wastewaterKg > 0) {
          world.resources.add(crew.location, R_WASTEWATER, wastewaterKg, "crew-wastewater");
        }

        const foodGot = colonyConsume(world, R_FOOD, foodPerTick, "crew-meals");
        if (foodGot < foodPerTick * 0.999) {
          if (crew.hungerHours === 0) {
            pushAlert(
              world,
              ids.alertsEntity,
              "critical",
              "food-depleted",
              `${crew.name} has no food — schedule a resupply before morale and health collapse`,
            );
          }
          crew.hungerHours += 1;
        } else {
          crew.hungerHours = 0;
        }
      }

      // ── machine passes (entity order; rates scale with power & condition) ──
      const o2TargetKg = living * pack.number("crew_o2_day") * o2ReserveDays;
      for (const [entity, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        const eclss = def.eclss;
        if (
          eclss === undefined ||
          building.condition <= 0 ||
          world.tickCount < building.offlineUntilTick // hazard-forced outage
        ) {
          continue;
        }
        const duty = building.poweredFraction * building.condition;
        if (duty <= 0) {
          continue;
        }

        if (eclss.scrubberKgCo2Day > 0) {
          atmosphereTransferTo(world, pack, entity, R_CO2, (eclss.scrubberKgCo2Day / 24) * duty);
        }

        if (eclss.ogaKgO2Day > 0 && colonyAmount(world, R_O2) < o2TargetKg) {
          const o2WantedKg = (eclss.ogaKgO2Day / 24) * duty;
          const waterNeededKg = o2WantedKg / 0.89;
          const waterKg = colonyConsume(world, R_WATER, waterNeededKg, "oga-electrolysis");
          if (waterKg > 0) {
            world.resources.add(entity, R_O2, waterKg * 0.89, "oga-electrolysis");
            world.resources.add(entity, R_H2, waterKg * 0.11, "oga-electrolysis");
          }
        }

        if (eclss.waterKgDay > 0 && eclss.waterRecovery > 0) {
          // water_recovery_98 tech lifts ISS-baseline closure to BPA-class.
          const recovery = isUnlocked(world, ids.colonyEntity, "water_recovery_98")
            ? Math.max(eclss.waterRecovery, 0.98)
            : eclss.waterRecovery;
          const processedKg = colonyConsume(
            world,
            R_WASTEWATER,
            (eclss.waterKgDay / 24) * duty,
            "water-recycler",
          );
          if (processedKg > 0) {
            world.resources.add(entity, R_WATER, processedKg * recovery, "water-recycler");
            // Remainder is brine, lost until brine-processor tech (M5+).
          }
        }
        // Sabatier runs through the reaction framework from M4 (the
        // sabatier-unit hosts the 'sabatier' reaction).
      }

      // ── cabin CO₂ accumulation (per-crew accumulators, grace in HealthSystem) ──
      if (living > 0) {
        const co2PerPerson = atmosphereAmount(world, pack, R_CO2) / living;
        const danger = co2PerPerson >= co2DangerKgPerPerson;
        let wasDanger = false;
        for (const [, crew] of crews.entries()) {
          if (crew.alive !== 1) {
            continue;
          }
          wasDanger ||= crew.co2Hours > 0;
          if (danger) {
            crew.co2Hours += 1;
          } else {
            crew.co2Hours = 0;
          }
        }
        if (danger && !wasDanger) {
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            "co2-danger",
            `Cabin CO₂ at ${co2PerPerson.toFixed(2)} kg/person — scrubbing has fallen behind; restore scrubber power before health damage begins`,
          );
        }
        if (!danger && co2PerPerson >= co2WarningKgPerPerson) {
          // Onset-only warning: fire when crossing the threshold.
          if (world.tickCount % 24 === 0) {
            pushAlert(
              world,
              ids.alertsEntity,
              "warning",
              "co2-elevated",
              `Cabin CO₂ elevated (${co2PerPerson.toFixed(2)} kg/person) — check scrubber capacity vs crew count`,
            );
          }
        }
      }
    },
  };
}
