import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId, JsonObject } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import { pushAlert } from "../game/alerts.js";
import {
  ECONOMY_COMPONENT,
  ENVIRONMENT_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  RESUPPLY_COMPONENT,
  type EconomyComponent,
  type EnvironmentComponent,
  type PhaseComponent,
  type ResearchComponent,
  type ResupplyComponent,
} from "../game/components.js";
import { applyLandingDust } from "./dust.js";

/**
 * Logistics v1 (TASKS.md M5, docs/SDD.md §8): vehicle classes from the
 * constants pack (payload cap, $/kg tier, per-mode failure probability,
 * transit days), Starship-class gated behind orbital_refueling tech, and a
 * +5% landing-risk penalty for night arrivals without night_landing_nav.
 * Mission kinds: cargo (delivers a manifest, with repeat cadence), probe
 * (prospects a tile — Phase-0 gameplay), sortie (crewed surface stay,
 * abstracted pre-outpost). Launch costs are charged at scheduling; every
 * touchdown near an unpaved site kicks up dust.
 */

export interface LogisticsSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export interface VehicleClass {
  payloadKg: number;
  usdPerKg: number;
  failureIdeal: number;
  failureRealistic: number;
  transitDays: number;
}

export function vehicleClass(pack: ContentPack, id: string): VehicleClass {
  const value = pack.constant(`vehicle_${id}`).value;
  if (typeof value === "number") {
    throw new Error(`vehicle_${id} must be a composite constant`);
  }
  return value as unknown as VehicleClass;
}

export function importCostPerKg(pack: ContentPack): number {
  return vehicleClass(pack, "heavy").usdPerKg;
}

function realisticMode(world: World): boolean {
  const config = world.config;
  return (
    config !== null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    (config as JsonObject)["failureTables"] === "realistic"
  );
}

export function missionFailureP(
  world: World,
  pack: ContentPack,
  colonyEntity: EntityId,
  vehicle: VehicleClass,
  arrivalIsNight: boolean,
): number {
  const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).get(colonyEntity);
  const unlocked = research?.unlocked ?? [];
  let p = realisticMode(world) ? vehicle.failureRealistic : vehicle.failureIdeal;
  if (realisticMode(world) && unlocked.includes("precision_landing")) {
    // CLPS-era 50% improves to ~15% with precision landing (PHASES.md P0).
    p = Math.min(p, 0.15);
  }
  if (arrivalIsNight && !unlocked.includes("night_landing_nav")) {
    p += pack.number("night_landing_penalty");
  }
  return Math.min(1, p);
}

export function createLogisticsSystem(
  pack: ContentPack,
  map: LunarMap,
  ids: LogisticsSystemIds,
): System {
  const sortieScience = 50;
  const probeScience = 20;

  return {
    name: "logistics",
    update: (world) => {
      const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(1);
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);

      for (const [entity, mission] of missions.entries()) {
        if (world.tickCount < mission.arrivalTick) {
          continue;
        }
        const vehicle = vehicleClass(pack, mission.vehicle);
        const failP = missionFailureP(world, pack, ids.colonyEntity, vehicle, env.isNight === 1);
        const failed = world.rng.chance(failP);

        if (failed) {
          mission.failures += 1;
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            "landing-failure",
            `${mission.kind === "cargo" ? "Cargo lander" : mission.kind === "probe" ? "Robotic probe" : "Sortie lander"} lost on descent (${(failP * 100).toFixed(0)}% risk) — the manifest is gone; the program absorbs the loss`,
          );
        } else {
          applyLandingDust(world, pack, ids.colonyEntity);
          if (mission.kind === "cargo") {
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
          } else if (mission.kind === "probe") {
            phase.successfulLandings += 1;
            research.sciencePoints += probeScience;
            const tile = tileAt(map, mission.targetX, mission.targetY);
            if (tile.iceFrac > 0.01 && phase.iceCharacterized === 0) {
              phase.iceCharacterized = 1;
              phase.milestones.push({ tick: world.tickCount, id: "ice-characterized" });
              pushAlert(
                world,
                ids.alertsEntity,
                "info",
                "ice-characterized",
                `Probe at (${mission.targetX}, ${mission.targetY}) confirmed water ice at ${(tile.iceFrac * 100).toFixed(1)} wt% — a mining site exists`,
              );
            } else {
              pushAlert(
                world,
                ids.alertsEntity,
                "info",
                "probe-landed",
                `Robotic probe down at (${mission.targetX}, ${mission.targetY}) — ${tile.iceFrac > 0.01 ? "ice-bearing" : "dry"} regolith surveyed (+${probeScience} science)`,
              );
            }
          } else if (mission.kind === "sortie") {
            phase.sortiesCompleted += 1;
            research.sciencePoints += sortieScience;
            phase.milestones.push({
              tick: world.tickCount,
              id: `sortie-${phase.sortiesCompleted}`,
            });
            pushAlert(
              world,
              ids.alertsEntity,
              "info",
              "sortie-complete",
              `Crewed sortie ${phase.sortiesCompleted} complete: ${pack.number("sortie_stay_days")} days on the surface, crew home safe (+${sortieScience} science)`,
            );
          }
        }

        if (mission.repeatTicks > 0) {
          mission.arrivalTick += mission.repeatTicks;
        } else {
          world.destroyEntity(entity);
        }
      }
    },
  };
}

/** Charge a mission's launch cost to the budget (called at scheduling). */
export function chargeLaunch(world: World, colonyEntity: EntityId, costUsd: number): void {
  const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).get(colonyEntity);
  if (economy !== undefined) {
    economy.balanceUsd -= costUsd;
    economy.totalLaunchSpendUsd += costUsd;
  }
}
