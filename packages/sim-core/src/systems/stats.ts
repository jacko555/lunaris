import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import { STATS_COMPONENT, type StatsComponent } from "../game/components.js";
import { R_O2, R_WATER } from "../game/resource-ids.js";

/**
 * Colony flow statistics: classifies every kg of O₂ and water created this
 * tick as imported (earth-resupply) or locally produced (reactions, OGA,
 * mining, Sabatier), rolling per lunar cycle. The last completed cycle's
 * local share drives the "≥50% O₂+water locally produced" v0.1 MVP
 * milestone and the Phase-3 transition (PHASES.md).
 *
 * Reads the PREVIOUS tick's ledger report (this system cannot see its own
 * tick's books before they close) — a deterministic one-tick lag.
 */

export interface StatsSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

const TRACKED = [R_O2, R_WATER];

/**
 * Life-support recirculation: reclaiming or converting mass already inside
 * the loop. Counting these as "production" would let an ISS-style recycler
 * hit the ISRU milestone without ever touching the Moon — only mining and
 * ISRU reactions count as local production.
 */
const RECIRCULATION = new Set([
  "water-recycler",
  "oga-electrolysis",
  "sabatier",
  "reaction-sabatier",
  "reaction-water-electrolysis",
  "crew-breathing",
  "crew-wastewater",
]);

export function createStatsSystem(pack: ContentPack, ids: StatsSystemIds): System {
  const ticksPerCycle = Math.round(pack.number("day_synodic") * 24);

  return {
    name: "stats",
    update: (world) => {
      const stats = world.store<StatsComponent>(STATS_COMPONENT).require(ids.colonyEntity);
      const report = world.ledgerReport();
      if (report !== null) {
        for (const resource of TRACKED) {
          const byTag = report.createdByResource[resource];
          if (byTag === undefined) {
            continue;
          }
          for (const tag of Object.keys(byTag)) {
            const kg = byTag[tag] as number;
            if (tag === "earth-resupply" || tag === "initial-stock") {
              stats.cycleImportedKg += kg;
              stats.cumulativeImportedKg += kg;
            } else if (!RECIRCULATION.has(tag)) {
              // Mining and ISRU reaction output (ice-extraction water,
              // MRE/electrolysis O₂ from locally produced feed).
              stats.cycleLocalKg += kg;
              stats.cumulativeLocalKg += kg;
            }
          }
        }
      }

      // Close out the lunar cycle.
      if (world.tickCount > 0 && world.tickCount % ticksPerCycle === 0) {
        const total = stats.cycleLocalKg + stats.cycleImportedKg;
        stats.lastCycleLocalShare = total > 0 ? stats.cycleLocalKg / total : 0;
        stats.cycleLocalKg = 0;
        stats.cycleImportedKg = 0;
        if (stats.lastCycleLocalShare >= 0.5 && stats.isru50Milestone === 0) {
          stats.isru50Milestone = 1;
          pushAlert(
            world,
            ids.alertsEntity,
            "info",
            "milestone-isru-50",
            `MILESTONE: ${(stats.lastCycleLocalShare * 100).toFixed(0)}% of O₂ + water produced locally last lunar day — the colony is living off the land (v0.1 goal)`,
          );
        }
      }
    },
  };
}
