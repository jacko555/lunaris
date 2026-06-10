import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  CREW_COMPONENT,
  ENVIRONMENT_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  STATS_COMPONENT,
  type CrewComponent,
  type EnvironmentComponent,
  type PhaseComponent,
  type ResearchComponent,
  type StatsComponent,
} from "../game/components.js";

/**
 * Phase engine, Phases 0–3 (docs/PHASES.md). Measurable criteria:
 *   0→1  ≥2 successful landings, an ice deposit characterized, comms active
 *   1→2  ≥2 sorties completed AND surface_power_40kw researched
 *   2→3  a full crewed lunar night survived AND continuous occupation
 *        ≥180 days AND any local O₂/water produced (ISRU demo)
 * Phase 3's own exit (→4: closure ≥50%, pop ≥50, workshop) is v1.0 scope;
 * the stats system already raises the ≥50% local O₂+water milestone.
 *
 * Milestone flags are pushed by logistics (landings, sorties) and here
 * (night survival, occupation); each transition fires a milestone alert
 * (summary screens read `milestones`).
 */

export interface PhaseSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createPhaseSystem(pack: ContentPack, ids: PhaseSystemIds): System {
  const occupationRequiredTicks = 180 * 24; // PHASES.md: ≥6 months
  const ticksPerLunarDay = Math.round(pack.number("day_synodic") * 24);
  const nightTicks = Math.round(ticksPerLunarDay / 2);

  return {
    name: "phase",
    update: (world) => {
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const stats = world.store<StatsComponent>(STATS_COMPONENT).require(ids.colonyEntity);
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(1);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);

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
          phase.milestones.push("night-survived");
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "milestone-night",
            "MILESTONE: the crew survived a full lunar night on the surface — the hardest exam on the Moon",
          );
        }
      } else if (env.isNight === 0) {
        phase.nightTicksWithCrew = 0;
      } else {
        phase.nightTicksWithCrew = 0; // night but no living crew
      }

      if (stats.cumulativeLocalKg > 0 && phase.isruDemo === 0) {
        phase.isruDemo = 1;
        phase.milestones.push("isru-demo");
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "milestone-isru-demo",
          "MILESTONE: first locally produced O₂/water — in-situ resource utilization is real",
        );
      }

      // ── transitions ──
      const advance = (to: number, summary: string): void => {
        phase.phase = to;
        phase.milestones.push(`phase-${to}`);
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
      }
    },
  };
}
