import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { Tech } from "../schema/items.js";
import type { EntityId, JsonObject } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  RESEARCH_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type ResearchComponent,
} from "../game/components.js";

/**
 * Research system (TECH-TREE.md). Science points accrue from lab buildings
 * (sciencePerDay × duty) and scientist crew (science_per_scientist_day per
 * skill point). The pool drains into the current project until its cost is
 * met; optional '?' prereqs grant the −20% synergy discount. Realistic
 * mode rolls one research setback on TRL ≤ 3 nodes (progress −50%,
 * EVENTS-style alert). Unlock gating is enforced at placement
 * (construction.validatePlacement) and by phase criteria.
 */

export interface ResearchSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function effectiveTechCost(tech: Tech, unlocked: string[]): number {
  let cost = tech.costScience;
  const hasSynergy = tech.prereqs.some((p) => p.endsWith("?") && unlocked.includes(p.slice(0, -1)));
  if (hasSynergy) {
    cost *= 0.8;
  }
  return cost;
}

export function hardPrereqsMet(tech: Tech, unlocked: string[]): boolean {
  return tech.prereqs.every((p) => p.endsWith("?") || unlocked.includes(p));
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

export function createResearchSystem(pack: ContentPack, ids: ResearchSystemIds): System {
  const perScientistDay = pack.number("science_per_scientist_day");

  return {
    name: "research",
    update: (world) => {
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);

      // ── science generation ──
      let pointsPerDay = 0;
      for (const [, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (def.sciencePerDay > 0) {
          pointsPerDay += def.sciencePerDay * building.poweredFraction * building.condition;
        }
      }
      for (const [, crew] of crews.entries()) {
        if (crew.alive === 1) {
          pointsPerDay += (crew.skills["scientist"] ?? 0) * perScientistDay;
        }
      }
      research.sciencePoints += pointsPerDay / 24;

      // ── current project ──
      if (research.current === "") {
        return;
      }
      const tech = pack.techNode(research.current);
      const cost = effectiveTechCost(tech, research.unlocked);

      const draw = Math.min(research.sciencePoints, cost - research.progress);
      if (draw > 0) {
        research.sciencePoints -= draw;
        research.progress += draw;
      }

      // Realistic-mode setback on immature tech (TECH-TREE tree rules).
      if (
        realisticMode(world) &&
        tech.trl2026 <= 3 &&
        research.setbackApplied === 0 &&
        research.progress > cost * 0.3 &&
        world.rng.chance((tech.setbackRisk ?? 0.1) / 720)
      ) {
        research.progress *= 0.5;
        research.setbackApplied = 1;
        pushAlert(
          world,
          ids.alertsEntity,
          "warning",
          "research-setback",
          `Research setback on '${tech.id}' (TRL ${tech.trl2026}) — half the progress lost to a failed test campaign`,
        );
      }

      if (research.progress >= cost - 1e-9) {
        research.unlocked.push(tech.id);
        research.current = "";
        research.progress = 0;
        research.setbackApplied = 0;
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "tech-unlocked",
          `Research complete: ${tech.id} — ${tech.unlocks.buildings.length > 0 ? `unlocks ${tech.unlocks.buildings.join(", ")}` : "capability upgrade active"}`,
        );
      }
    },
  };
}
