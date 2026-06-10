import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  ENVIRONMENT_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  STATS_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type EconomyComponent,
  type EnvironmentComponent,
  type PhaseComponent,
  type ResearchComponent,
  type StatsComponent,
} from "../game/components.js";

/**
 * Phase engine, Phases 0–6 (docs/PHASES.md). Measurable criteria:
 *   0→1  ≥2 successful landings, ice characterized, comms active
 *   1→2  ≥2 sorties AND surface_power_40kw researched
 *   2→3  full crewed night survived AND ≥180 d occupation AND ISRU demo
 *   3→4  closure ≥50% AND ≥50% local O₂+water AND pop ≥50 AND workshop
 *   4→5  closure ≥90% AND pop ≥500 AND mass_driver researched
 *   5→6  export economy net-positive over ≥5 years in phase AND pop ≥2000
 * Phases 5–6 are sandbox-scale (flagged speculative in the encyclopedia);
 * the mechanics are exact even where the populations are aspirational.
 * Milestones are timestamped — they are the observer-mode timeline.
 */

export interface PhaseSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createPhaseSystem(pack: ContentPack, ids: PhaseSystemIds): System {
  const occupationRequiredTicks = 180 * 24; // PHASES.md: ≥6 months
  const ticksPerLunarDay = Math.round(pack.number("day_synodic") * 24);
  const nightTicks = Math.round(ticksPerLunarDay / 2);
  const fiveYearsTicks = 5 * 8766;

  return {
    name: "phase",
    update: (world) => {
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const stats = world.store<StatsComponent>(STATS_COMPONENT).require(ids.colonyEntity);
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);
      const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(ids.colonyEntity);
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(1);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);

      const milestone = (id: string): void => {
        phase.milestones.push({ tick: world.tickCount, id });
      };

      // ── continuous trackers ──
      let living = 0;
      for (const [, crew] of crews.entries()) {
        if (crew.alive === 1) {
          living++;
        }
      }
      phase.occupationTicks = living > 0 ? phase.occupationTicks + 1 : 0;

      if (env.isNight === 1 && living > 0) {
        phase.nightTicksWithCrew += 1;
        if (phase.nightTicksWithCrew >= nightTicks && phase.nightSurvived === 0) {
          phase.nightSurvived = 1;
          milestone("night-survived");
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "milestone-night",
            "MILESTONE: the crew survived a full lunar night on the surface — the hardest exam on the Moon",
          );
        }
      } else {
        phase.nightTicksWithCrew = 0;
      }

      if (stats.cumulativeLocalKg > 0 && phase.isruDemo === 0) {
        phase.isruDemo = 1;
        milestone("isru-demo");
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "milestone-isru-demo",
          "MILESTONE: first locally produced O₂/water — in-situ resource utilization is real",
        );
      }

      // Workshop online = any building manufacturing spare parts.
      let workshopOnline = false;
      for (const [, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (
          building.condition > 0 &&
          def.reactions.some((rid) => pack.reaction(rid).primaryOutput === "spare-parts")
        ) {
          workshopOnline = true;
          break;
        }
      }

      // ── transitions ──
      const advance = (to: number, summary: string): void => {
        phase.phase = to;
        phase.phaseEnteredTick = world.tickCount;
        milestone(`phase-${to}`);
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          `phase-${to}`,
          `PHASE ${to} REACHED: ${summary}`,
        );
      };

      if (
        phase.phase === 0 &&
        phase.successfulLandings >= 2 &&
        phase.iceCharacterized === 1 &&
        phase.commsActive === 1
      ) {
        advance(1, "Robotic precursors done — the site is mapped, crewed sorties unlocked");
      } else if (
        phase.phase === 1 &&
        phase.sortiesCompleted >= 2 &&
        research.unlocked.includes("surface_power_40kw")
      ) {
        advance(2, "Sortie campaign complete — time to build the outpost");
      } else if (
        phase.phase === 2 &&
        phase.nightSurvived === 1 &&
        phase.occupationTicks >= occupationRequiredTicks &&
        phase.isruDemo === 1
      ) {
        advance(3, "Permanent base: night survived, six months of occupation, ISRU demonstrated");
      } else if (
        phase.phase === 3 &&
        stats.lastCycleClosure >= 0.5 &&
        stats.isru50Milestone === 1 &&
        living >= 50 &&
        workshopOnline
      ) {
        advance(
          4,
          "Self-sustaining settlement: half the colony's mass is lunar, parts are local, fifty live here",
        );
      } else if (
        phase.phase === 4 &&
        stats.lastCycleClosure >= 0.9 &&
        living >= 500 &&
        research.unlocked.includes("mass_driver")
      ) {
        advance(5, "Industrial export economy: 90% closure and a mass driver on the books");
      } else if (
        phase.phase === 5 &&
        living >= 2000 &&
        world.tickCount - phase.phaseEnteredTick >= fiveYearsTicks &&
        economy.totalRevenueUsd > economy.totalLaunchSpendUsd + economy.totalOpsSpendUsd
      ) {
        advance(
          6,
          "Lunar city: a sustained net-positive export economy. The frontier is a hometown (sandbox — speculative era)",
        );
      }
    },
  };
}
