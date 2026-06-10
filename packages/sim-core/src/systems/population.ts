import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type PhaseComponent,
  type ResearchComponent,
} from "../game/components.js";
import { colonyAmount } from "../game/pool.js";
import { R_FOOD } from "../game/resource-ids.js";
import { farmCoverage } from "./food.js";

/**
 * Population dynamics (TASKS.md M7). Immigration waves arrive from Phase 3
 * while housing, food runway, and farm capacity allow (the constraints ARE
 * the demographic policy). Births begin at Phase 4 with
 * partial_g_countermeasures researched and medical capacity present —
 * surfaced gently as the milestone arc the design asks for. New arrivals
 * berth in the emptiest housing.
 */

export interface PopulationSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createPopulationSystem(pack: ContentPack, ids: PopulationSystemIds): System {
  const waveIntervalTicks = Math.round(pack.number("immigration_wave_days") * 24);
  const waveSize = Math.round(pack.number("immigration_wave_size"));
  const birthRatePerTick = pack.number("birth_rate_per_year_per_10_crew") / 10 / 8760;

  return {
    name: "population",
    update: (world) => {
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);

      let living = 0;
      for (const [, crew] of crews.entries()) {
        if (crew.alive === 1) {
          living++;
        }
      }

      let housing = 0;
      let medical = 0;
      let homeEntity: EntityId | null = null;
      for (const [entity, building] of buildings.entries()) {
        const services = pack.building(building.defId).services;
        housing += services.housing ?? 0;
        medical += services.medical ?? 0;
        if ((services.housing ?? 0) > 0 && homeEntity === null) {
          homeEntity = entity;
        }
      }

      // ── immigration waves (Phase 3+) ──
      if (
        phase.phase >= 3 &&
        homeEntity !== null &&
        world.tickCount > 0 &&
        world.tickCount % waveIntervalTicks === 0
      ) {
        const foodRunwayDays = colonyAmount(world, R_FOOD) / Math.max(1, living * 0.62);
        const coverage = farmCoverage(buildings.entries(), pack, living);
        const room = housing - living;
        if (room > 0 && (foodRunwayDays > 60 || coverage >= 1)) {
          const arriving = Math.min(waveSize, room);
          for (let i = 0; i < arriving; i++) {
            const entity = world.createEntity();
            crews.set(entity, {
              name: `Settler-${world.tickCount}-${i}`,
              skills:
                i % 3 === 0
                  ? { engineer: 2 }
                  : i % 3 === 1
                    ? { scientist: 2 }
                    : { agronomist: 2, medic: 1 },
              health: 100,
              morale: pack.number("morale_baseline"),
              doseCareerMSv: 0,
              dose30d: Array.from({ length: 30 }, () => 0),
              location: homeEntity,
              eva: 0,
              alive: 1,
              hungerHours: 0,
              thirstHours: 0,
              hypoxiaHours: 0,
              co2Hours: 0,
              radiationSick: 0,
            });
          }
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "immigration-wave",
            `Immigration wave: ${arriving} settlers landed — population ${living + arriving}`,
          );
        }
      }

      // ── births (Phase 4+, countermeasures + medical capacity) ──
      if (
        phase.phase >= 4 &&
        homeEntity !== null &&
        medical > 0 &&
        research.unlocked.includes("partial_g_countermeasures") &&
        living >= 2 &&
        world.rng.chance(birthRatePerTick * living)
      ) {
        const entity = world.createEntity();
        crews.set(entity, {
          name: `Born-${world.tickCount}`,
          skills: {}, // children are non-workers (PHASES.md)
          health: 100,
          morale: pack.number("morale_baseline"),
          doseCareerMSv: 0,
          dose30d: Array.from({ length: 30 }, () => 0),
          location: homeEntity,
          eva: 0,
          alive: 1,
          hungerHours: 0,
          thirstHours: 0,
          hypoxiaHours: 0,
          co2Hours: 0,
          radiationSick: 0,
        });
        const first = !phase.milestones.some((m) => m.id === "first-birth");
        if (first) {
          phase.milestones.push({ tick: world.tickCount, id: "first-birth" });
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "first-birth",
            "MILESTONE: the first child born on the Moon. A settlement became a home.",
          );
        }
      }
    },
  };
}
