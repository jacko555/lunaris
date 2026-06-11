import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  ROVER_COMPONENT,
  type PhaseComponent,
  type ResearchComponent,
  type RoverComponent,
} from "../game/components.js";
import { R_WATER_ICE } from "../game/resource-ids.js";

/**
 * Rover & expedition system (M-Rover, TASKS.md M8+): autonomous surface
 * explorers that traverse to a target tile, survey it, and haul samples
 * home. Surveying a PSR ice tile yields science points, a water-ice sample
 * (declared ground source: 'rover-sampling'), and counts toward the Phase-0
 * ice-characterization criterion — a slower, richer alternative to probes.
 *
 * States: 0 idle (recharging at base) · 1 outbound · 2 surveying ·
 * 3 returning · 4 stranded (battery empty or wrecked — recovery is a future
 * crewed-sortie hook; v1 the asset is lost where it sits).
 *
 * Determinism: the only RNG draw is one failure roll per completed survey,
 * so worlds without rovers consume no extra randomness.
 */

export interface RoverSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export interface RoverSpec {
  costUsd: number;
  massKg: number;
  speedKmh: number;
  batteryKwh: number;
  drainKwhPerKm: number;
  surveyHours: number;
  cargoKg: number;
}

export function roverSpec(pack: ContentPack, kind: string): RoverSpec {
  const value = pack.constant(`rover_${kind}`).value as Record<string, number>;
  return {
    costUsd: value["costUsd"] as number,
    massKg: value["massKg"] as number,
    speedKmh: value["speedKmh"] as number,
    batteryKwh: value["batteryKwh"] as number,
    drainKwhPerKm: value["drainKwhPerKm"] as number,
    surveyHours: value["surveyHours"] as number,
    cargoKg: value["cargoKg"] as number,
  };
}

/** First building entity (entity order) — where samples are delivered. */
function sampleDepot(world: World): EntityId | null {
  const entities = world.store(BUILDING_COMPONENT).entities();
  return entities.length > 0 ? (entities[0] as EntityId) : null;
}

export function createRoverSystem(pack: ContentPack, map: LunarMap, ids: RoverSystemIds): System {
  const tileKm = pack.number("tile_size_m") / 1000;
  const sciencePerSurvey = pack.number("survey_science_points");
  const failure = pack.constant("rover_failure_per_expedition").value as Record<string, number>;

  return {
    name: "rovers",
    update: (world) => {
      const rovers = world.store<RoverComponent>(ROVER_COMPONENT);
      if (rovers.size === 0) {
        return;
      }
      const config = world.config;
      const mode =
        config !== null &&
        typeof config === "object" &&
        !Array.isArray(config) &&
        (config as Record<string, unknown>)["failureTables"] === "ideal"
          ? "ideal"
          : "realistic";

      for (const [entity, rover] of rovers.entries()) {
        const spec = roverSpec(pack, rover.kind);

        if (rover.state === 0) {
          // Idle at base: trickle recharge (grid coupling abstracted — see
          // docs/SDD note; a 3 kW pad charger is below grid resolution).
          rover.batteryKwh = Math.min(spec.batteryKwh, rover.batteryKwh + 3);
          continue;
        }
        if (rover.state === 4) {
          continue; // stranded
        }

        if (rover.state === 2) {
          // Surveying: idle draw, but never below the return reserve — the
          // instruments brown out before the rover spends its ride home.
          const homeKm =
            Math.sqrt((rover.homeX - rover.x) ** 2 + (rover.homeY - rover.y) ** 2) * tileKm;
          const reserveKwh = homeKm * spec.drainKwhPerKm * 1.15;
          rover.surveyHoursLeft -= 1;
          rover.batteryKwh = Math.max(reserveKwh, rover.batteryKwh - 0.2);
          if (rover.surveyHoursLeft > 0) {
            continue;
          }
          const tile = tileAt(map, Math.round(rover.x), Math.round(rover.y));
          rover.surveysDone += 1;
          rover.scienceQueued += sciencePerSurvey;
          if (tile.iceFrac > 0) {
            // Sample mass scales with local ice richness vs the LCROSS 5.6%.
            rover.cargoIceKg = Math.min(spec.cargoKg, spec.cargoKg * (tile.iceFrac / 0.056));
            world.resources.add(entity, R_WATER_ICE, rover.cargoIceKg, "rover-sampling");
            rover.scienceQueued += sciencePerSurvey; // ice ground truth pays double
          }
          if (world.rng.chance(failure[mode] as number)) {
            rover.condition = Math.max(0, rover.condition - 0.5);
            pushAlert(
              world,
              ids.alertsEntity,
              "warning",
              "rover-damage",
              `${rover.kind} rover damaged during survey at (${Math.round(rover.x)}, ${Math.round(rover.y)}) — condition ${(rover.condition * 100).toFixed(0)}%`,
            );
          }
          rover.state = 3;
          rover.targetX = rover.homeX;
          rover.targetY = rover.homeY;
          continue;
        }

        // Outbound (1) or returning (3): traverse toward the target.
        const dx = rover.targetX - rover.x;
        const dy = rover.targetY - rover.y;
        const distTiles = Math.sqrt(dx * dx + dy * dy);
        const tilesPerHour = (spec.speedKmh * (rover.condition > 0.5 ? 1 : 0.5)) / tileKm;
        const step = Math.min(distTiles, tilesPerHour);
        if (step > 0) {
          rover.x += (dx / distTiles) * step;
          rover.y += (dy / distTiles) * step;
          rover.batteryKwh -= step * tileKm * spec.drainKwhPerKm;
          if (rover.batteryKwh <= 0) {
            rover.batteryKwh = 0;
            rover.state = 4;
            pushAlert(
              world,
              ids.alertsEntity,
              "critical",
              "rover-stranded",
              `${rover.kind} rover battery exhausted at (${rover.x.toFixed(1)}, ${rover.y.toFixed(1)}) — asset lost. Plan traverses inside ${((spec.batteryKwh / spec.drainKwhPerKm) * 0.5).toFixed(0)} km range.`,
            );
            continue;
          }
        }
        if (distTiles - step > 0.01) {
          continue; // still traveling
        }
        if (rover.state === 1) {
          rover.state = 2;
          rover.surveyHoursLeft = spec.surveyHours;
          continue;
        }
        // Arrived home: deliver samples + science, go idle.
        const depot = sampleDepot(world);
        if (rover.cargoIceKg > 0 && depot !== null) {
          world.resources.remove(entity, R_WATER_ICE, rover.cargoIceKg, "rover-unload");
          world.resources.add(depot, R_WATER_ICE, rover.cargoIceKg, "rover-unload");
        }
        const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).get(ids.colonyEntity);
        if (research !== undefined && rover.scienceQueued > 0) {
          research.sciencePoints += rover.scienceQueued;
        }
        const phase = world.store<PhaseComponent>(PHASE_COMPONENT).get(ids.colonyEntity);
        if (phase !== undefined && rover.cargoIceKg > 0) {
          phase.iceCharacterized = 1; // ground truth beats remote sensing
        }
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "expedition-complete",
          `${rover.kind} rover home: +${rover.scienceQueued.toFixed(0)} science${rover.cargoIceKg > 0 ? `, ${rover.cargoIceKg.toFixed(1)} kg ice core delivered` : ""}`,
        );
        rover.scienceQueued = 0;
        rover.cargoIceKg = 0;
        rover.state = 0;
      }
    },
  };
}
