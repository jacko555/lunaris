import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import { RIVAL_COMPONENT, type RivalComponent } from "../game/components.js";

/**
 * International competition ticker (TASKS.md M7, MODES.md): the rival
 * program's milestone schedule (from the scenario's `rival` block) fires
 * as flavor alerts — pressure, not a wargame (GDD §9). Realistic mode adds
 * ±6 months of schedule noise per milestone, drawn deterministically.
 */

export interface RivalSystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createRivalSystem(pack: ContentPack, ids: RivalSystemIds): System {
  void pack;
  return {
    name: "rival",
    update: (world) => {
      const rival = world.store<RivalComponent>(RIVAL_COMPONENT).get(ids.colonyEntity);
      if (rival === undefined || rival.upcoming.length === 0) {
        return;
      }
      const next = rival.upcoming[0] as { tick: number; label: string };
      if (world.tickCount >= next.tick) {
        rival.upcoming.shift();
        pushAlert(
          world,
          ids.alertsEntity,
          "info",
          "rival-milestone",
          `📡 ${rival.name}: ${next.label}`,
        );
      }
    },
  };
}
