import type { World } from "../ecs/world.js";
import type { WorldDef } from "../save.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId, JsonValue } from "../types.js";
import { inBounds, tileAt, type LunarMap } from "../map/tiles.js";
import { createEnvironmentSystem } from "../systems/environment.js";
import { createPowerSystem } from "../systems/power.js";
import { createThermalSystem } from "../systems/thermal.js";
import { pushAlert } from "./alerts.js";
import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  STORAGE_COMPONENT,
  THERMAL_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type EnvironmentComponent,
  type GridComponent,
  type StorageComponent,
  type ThermalComponent,
} from "./components.js";

/**
 * The game world definition: singleton entities, systems in the fixed
 * registry order Environment → Power → Thermal (docs/TAD.md §3 — later
 * systems slot in between Thermal and the milestone-4+ stages), and the
 * command surface. Content (pack) and terrain (map) are static inputs
 * captured by closure — they are not world state and never serialize.
 */

/** Singleton entity ids, fixed by setup order. */
export const ENV_ENTITY: EntityId = 1;
export const GRID_ENTITY: EntityId = 2;
export const ALERTS_ENTITY: EntityId = 3;

export const CMD_PLACE_BUILDING = "cmd-place-building";
export const CMD_REMOVE_BUILDING = "cmd-remove-building";

export interface CmdPlaceBuildingPayload {
  defId: string;
  x: number;
  y: number;
  [key: string]: JsonValue;
}

export function createGameDef(pack: ContentPack, map: LunarMap): WorldDef {
  return {
    setup(world: World): void {
      const environments = world.registerComponent<EnvironmentComponent>(ENVIRONMENT_COMPONENT);
      const grids = world.registerComponent<GridComponent>(GRID_COMPONENT);
      const alerts = world.registerComponent<AlertsComponent>(ALERTS_COMPONENT);
      const buildings = world.registerComponent<BuildingComponent>(BUILDING_COMPONENT);
      const thermals = world.registerComponent<ThermalComponent>(THERMAL_COMPONENT);
      const storages = world.registerComponent<StorageComponent>(STORAGE_COMPONENT);

      const envEntity = world.createEntity();
      const gridEntity = world.createEntity();
      const alertsEntity = world.createEntity();
      if (
        envEntity !== ENV_ENTITY ||
        gridEntity !== GRID_ENTITY ||
        alertsEntity !== ALERTS_ENTITY
      ) {
        throw new Error("Game singletons must be the first entities created");
      }
      environments.set(envEntity, {
        lunarPhase: 0,
        tempSurfaceK: 250,
        tempPsrK: pack.number("temp_psr"),
        litA: 1,
        litB: 1,
        litC: 0,
        isNight: 0,
      });
      grids.set(gridEntity, {
        generationKw: 0,
        demandKw: 0,
        suppliedKw: 0,
        unmetKw: 0,
        chargeKw: 0,
        dischargeKw: 0,
        curtailedKw: 0,
        storedKwh: 0,
        storageCapacityKwh: 0,
        tierDemandKw: [0, 0, 0, 0],
        tierFraction: [1, 1, 1, 1],
        brownout: 0,
      });
      alerts.set(alertsEntity, { entries: [], seq: 0 });

      const ids = { envEntity: ENV_ENTITY, gridEntity: GRID_ENTITY, alertsEntity: ALERTS_ENTITY };
      world.registerSystem(createEnvironmentSystem(pack, ENV_ENTITY));
      world.registerSystem(createPowerSystem(pack, map, ids));
      world.registerSystem(createThermalSystem(pack, map, ids));

      world.registerCommandHandler(CMD_PLACE_BUILDING, (w, payload) => {
        const { defId, x, y } = payload as CmdPlaceBuildingPayload;
        const reject = (reason: string): void => {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "placement-rejected",
            `Cannot place '${defId}' at (${x}, ${y}): ${reason}`,
          );
        };
        let def;
        try {
          def = pack.building(defId);
        } catch {
          reject("unknown building");
          return;
        }
        if (!inBounds(map, x, y)) {
          reject("outside the map");
          return;
        }
        const tile = tileAt(map, x, y);
        if (def.placement.requiresPSR && tile.illumClass !== "C") {
          reject("requires a permanently shadowed tile");
          return;
        }
        if (!def.placement.terrain.includes(tile.regolith)) {
          reject(`needs ${def.placement.terrain.join(" or ")} terrain`);
          return;
        }
        if (tile.slopeDeg > def.placement.maxSlope) {
          reject(`slope ${tile.slopeDeg}° exceeds maximum ${def.placement.maxSlope}°`);
          return;
        }
        const entity = w.createEntity();
        buildings.set(entity, { defId, x, y, condition: 1, poweredFraction: 0 });
        // Thermal management applies to active equipment (waste heat or
        // powered loads). Passive structures like solar arrays degrade via
        // the dust/wear systems (M4), not freeze/overheat states.
        if (def.heatKw > 0 || def.powerKw < 0) {
          thermals.set(entity, {
            tempK: pack.number("temp_internal_target"),
            state: "nominal",
            heaterRequestKw: 0,
            heaterDeliveredKw: 0,
          });
        }
        if (def.storageKwh !== undefined) {
          // Storage arrives charged (commissioning assumption, deterministic).
          storages.set(entity, { energyKwh: def.storageKwh });
        }
      });

      world.registerCommandHandler(CMD_REMOVE_BUILDING, (w, payload) => {
        const { entity } = payload as { entity: number };
        if (!buildings.has(entity)) {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "remove-rejected",
            `No building on entity ${entity}`,
          );
          return;
        }
        w.destroyEntity(entity);
      });
    },
  };
}
