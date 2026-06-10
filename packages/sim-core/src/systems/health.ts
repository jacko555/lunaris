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
import { colonyConsume } from "../game/pool.js";
import { R_MEDKITS } from "../game/resource-ids.js";
import { farmCoverage } from "./food.js";

/**
 * Health & morale system (docs/SDD.md §9 + the §6 failure cascades).
 *
 * Damage sources per tick (1 h), all flagged by ECLSS/radiation systems:
 *   hypoxia      — fast (hours) after a short grace
 *   CO₂ buildup  — after the co2_grace_ticks window (SDD §6 cascade)
 *   dehydration  — after 24 h of thirst
 *   starvation   — slow health decline after 24 h, but morale collapses
 *                  immediately (the legible food → morale → health chain)
 *   radiation    — while the rolling 30-day dose exceeds the NASA limit
 *   1/6-g drift  — bone/muscle baseline, fully offset while exercise
 *                  capacity covers the crew member (SDD §9)
 *
 * Medical events draw from the world RNG at the EVENTS.md ideal rate;
 * medkits and clinic capacity reduce their severity. Clinics heal the
 * lowest-health patients first. Death (health ≤ 0) names its dominant
 * cause in the alert (EVENTS.md design rule 1).
 */

export interface HealthSystemIds {
  alertsEntity: EntityId;
}

export function createHealthSystem(pack: ContentPack, ids: HealthSystemIds): System {
  const hypoxiaPerHour = pack.number("hypoxia_health_per_hour");
  const co2PerHour = pack.number("co2_health_per_hour");
  const co2GraceTicks = pack.number("co2_grace_ticks");
  const dehydrationPerTick = pack.number("dehydration_health_per_day") / 24;
  const starvationPerTick = pack.number("starvation_health_per_day") / 24;
  const starvationMoralePerTick = pack.number("starvation_morale_per_day") / 24;
  const radiationPerTick = pack.number("radiation_sickness_health_per_day") / 24;
  const doseLimit30Day = pack.number("dose_limit_30day");
  const driftPerTick = pack.number("bone_muscle_drift_per_month") / (30 * 24);
  const clinicHealPerTick = pack.number("clinic_heal_per_day") / 24;
  const medkitPerTreatmentDay = pack.number("clinic_medkit_per_patient_day");
  const medicalEventPerTick = pack.number("medical_event_rate_per_year_per_crew") / 8760;
  const moraleBaselineDefault = pack.number("morale_baseline");
  const freshFoodBonus = pack.number("fresh_food_morale_bonus");
  const moraleRecoveryPerTick = pack.number("morale_recovery_per_day") / 24;
  const crowdingMoralePerTick = pack.number("crowding_morale_per_day") / 24;

  return {
    name: "health",
    update: (world) => {
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);

      // Service capacities from powered, intact buildings.
      let exerciseSlots = 0;
      let clinicSlots = 0;
      let housing = 0;
      for (const [, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        const duty = building.poweredFraction * building.condition;
        if (duty <= 0) {
          continue;
        }
        exerciseSlots += (def.services.exercise ?? 0) * duty;
        clinicSlots += (def.services.medical ?? 0) * duty;
        housing += def.services.housing ?? 0;
      }

      const living: [EntityId, CrewComponent][] = [];
      for (const [entity, crew] of crews.entries()) {
        if (crew.alive === 1) {
          living.push([entity, crew]);
        }
      }
      const crowded = living.length > housing && housing >= 0;
      // Crop-variety morale (M7): fresh food for ≥half the diet lifts the
      // baseline everyone recovers toward.
      const coverage = farmCoverage(buildings.entries(), pack, living.length);
      const moraleBaseline = moraleBaselineDefault + (coverage >= 0.5 ? freshFoodBonus : 0);

      let exerciseUsed = 0;
      for (const [, crew] of living) {
        const damageByCause: [string, number][] = [];

        if (crew.hypoxiaHours > 2) {
          damageByCause.push(["hypoxia", hypoxiaPerHour]);
        }
        if (crew.co2Hours > co2GraceTicks) {
          damageByCause.push(["CO₂ poisoning", co2PerHour]);
        }
        if (crew.thirstHours > 24) {
          damageByCause.push(["dehydration", dehydrationPerTick]);
        }
        if (crew.hungerHours > 24) {
          damageByCause.push(["starvation", starvationPerTick]);
        }
        if (crew.radiationSick === 1) {
          // Severity scales with how far the rolling dose exceeds the limit
          // (a marginal exceedance is an illness, not a death sentence).
          const rolling = crew.dose30d.reduce((sum, d) => sum + d, 0);
          const excess = Math.min(1, Math.max(0, (rolling - doseLimit30Day) / doseLimit30Day));
          damageByCause.push(["radiation sickness", radiationPerTick * excess]);
        }
        // 1/6-g bone/muscle drift unless an exercise slot covers them.
        if (exerciseUsed < exerciseSlots) {
          exerciseUsed += 1;
        } else {
          damageByCause.push(["deconditioning (no exercise capacity)", driftPerTick]);
        }

        // Medical events (EVENTS.md Human table, ideal rate).
        if (world.rng.chance(medicalEventPerTick)) {
          const medkit = colonyConsume(world, R_MEDKITS, 1, "medical-treatment") >= 1;
          const inClinic = clinicSlots > 0;
          const severity = (medkit ? 5 : 15) * (inClinic ? 0.4 : 1);
          damageByCause.push(["medical emergency", severity]);
          pushAlert(
            world,
            ids.alertsEntity,
            "warning",
            "medical-event",
            `${crew.name} had a medical emergency (${medkit ? "medkit used" : "NO medkits left"}${inClinic ? ", treated in clinic" : ", no clinic capacity"}) — health −${severity.toFixed(0)}`,
          );
        }

        for (const [, damage] of damageByCause) {
          crew.health -= damage;
        }

        // ── morale ──
        if (crew.hungerHours > 0) {
          crew.morale -= starvationMoralePerTick;
        } else if (crew.morale < moraleBaseline) {
          // Recovery never overshoots baseline (crowding etc. then pull from there).
          crew.morale = Math.min(moraleBaseline, crew.morale + moraleRecoveryPerTick);
        }
        if (crowded) {
          crew.morale -= (crowdingMoralePerTick * (living.length - housing)) / living.length;
        }
        crew.morale = Math.max(0, Math.min(100, crew.morale));

        // ── death ──
        if (crew.health <= 0) {
          crew.health = 0;
          crew.alive = 0;
          const cause =
            damageByCause.length > 0
              ? (damageByCause.reduce((a, b) => (b[1] > a[1] ? b : a))[0] as string)
              : "injuries";
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            "crew-death",
            `${crew.name} has died — cause: ${cause}. Review life support and resupply cadence.`,
          );
        }
      }

      // ── clinic healing: lowest-health living patients first ──
      if (clinicSlots > 0) {
        const patients = living
          .filter(([, crew]) => crew.alive === 1 && crew.health < 100)
          .sort((a, b) => a[1].health - b[1].health || a[0] - b[0]);
        let slots = Math.floor(clinicSlots);
        for (const [, crew] of patients) {
          if (slots <= 0) {
            break;
          }
          const medkitNeed = (medkitPerTreatmentDay / 24) * 1;
          colonyConsume(world, R_MEDKITS, medkitNeed, "clinic-supplies");
          crew.health = Math.min(100, crew.health + clinicHealPerTick);
          slots -= 1;
        }
      }
    },
  };
}
