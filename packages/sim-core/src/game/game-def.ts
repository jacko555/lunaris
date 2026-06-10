import type { World } from "../ecs/world.js";
import type { WorldDef } from "../save.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId, JsonValue } from "../types.js";
import { inBounds, tileAt, type LunarMap } from "../map/tiles.js";
import { createEclssSystem } from "../systems/eclss.js";
import { createEnvironmentSystem } from "../systems/environment.js";
import { createHealthSystem } from "../systems/health.js";
import { createLogisticsSystem } from "../systems/logistics.js";
import { importCostPerKg } from "../systems/logistics.js";
import { createPowerSystem } from "../systems/power.js";
import { applySpeDose, createRadiationSystem } from "../systems/radiation.js";
import { createThermalSystem } from "../systems/thermal.js";
import { pushAlert } from "./alerts.js";
import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  RESUPPLY_COMPONENT,
  STORAGE_COMPONENT,
  THERMAL_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type CrewComponent,
  type EnvironmentComponent,
  type GridComponent,
  type ResupplyComponent,
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
export const CMD_ADD_CREW = "cmd-add-crew";
export const CMD_ASSIGN_CREW = "cmd-assign-crew";
export const CMD_SCHEDULE_RESUPPLY = "cmd-schedule-resupply";
export const CMD_CANCEL_RESUPPLY = "cmd-cancel-resupply";
export const CMD_TRIGGER_SPE = "cmd-trigger-spe";

export interface CmdPlaceBuildingPayload {
  defId: string;
  x: number;
  y: number;
  [key: string]: JsonValue;
}

export interface CmdAddCrewPayload {
  name: string;
  skills: Record<string, number>;
  location: number;
  [key: string]: JsonValue;
}

export interface CmdScheduleResupplyPayload {
  manifest: { resource: string; kg: number }[];
  arrivalTick: number;
  repeatTicks?: number;
  targetEntity: number;
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
      const crews = world.registerComponent<CrewComponent>(CREW_COMPONENT);
      const missions = world.registerComponent<ResupplyComponent>(RESUPPLY_COMPONENT);

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
      // Fixed registry order per docs/TAD.md §3:
      // Environment → Power → Thermal → ECLSS → Crew (radiation, health) → Logistics.
      world.registerSystem(createEnvironmentSystem(pack, ENV_ENTITY));
      world.registerSystem(createPowerSystem(pack, map, ids));
      world.registerSystem(createThermalSystem(pack, map, ids));
      world.registerSystem(createEclssSystem(pack, ids));
      world.registerSystem(createRadiationSystem(pack, ids));
      world.registerSystem(createHealthSystem(pack, ids));
      world.registerSystem(createLogisticsSystem(ids));

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

      world.registerCommandHandler(CMD_ADD_CREW, (w, payload) => {
        const { name, skills, location } = payload as CmdAddCrewPayload;
        const home = buildings.get(location);
        if (home === undefined || (pack.building(home.defId).services.housing ?? 0) <= 0) {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "crew-rejected",
            `Cannot berth ${name}: entity ${location} is not a housing building`,
          );
          return;
        }
        const entity = w.createEntity();
        crews.set(entity, {
          name,
          skills,
          health: 100,
          morale: pack.number("morale_baseline"),
          doseCareerMSv: 0,
          dose30d: Array.from({ length: 30 }, () => 0),
          location,
          eva: 0,
          alive: 1,
          hungerHours: 0,
          thirstHours: 0,
          hypoxiaHours: 0,
          co2Hours: 0,
          radiationSick: 0,
        });
      });

      world.registerCommandHandler(CMD_ASSIGN_CREW, (w, payload) => {
        const { crew, location, eva } = payload as {
          crew: number;
          location?: number;
          eva?: number;
        };
        const member = crews.get(crew);
        if (member === undefined || member.alive !== 1) {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "assign-rejected",
            `No living crew on entity ${crew}`,
          );
          return;
        }
        if (location !== undefined) {
          if (!buildings.has(location)) {
            pushAlert(
              w,
              ALERTS_ENTITY,
              "warning",
              "assign-rejected",
              `Cannot move ${member.name}: entity ${location} is not a building`,
            );
            return;
          }
          member.location = location;
        }
        if (eva !== undefined) {
          member.eva = eva === 1 ? 1 : 0;
        }
      });

      world.registerCommandHandler(CMD_SCHEDULE_RESUPPLY, (w, payload) => {
        const { manifest, arrivalTick, repeatTicks, targetEntity } =
          payload as CmdScheduleResupplyPayload;
        if (!buildings.has(targetEntity)) {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "resupply-rejected",
            `Resupply target entity ${targetEntity} is not a building`,
          );
          return;
        }
        let totalKg = 0;
        for (const entry of manifest) {
          try {
            pack.resource(entry.resource);
          } catch {
            pushAlert(
              w,
              ALERTS_ENTITY,
              "warning",
              "resupply-rejected",
              `Unknown resource '${entry.resource}' in resupply manifest`,
            );
            return;
          }
          if (!(entry.kg > 0)) {
            pushAlert(
              w,
              ALERTS_ENTITY,
              "warning",
              "resupply-rejected",
              "Manifest masses must be positive",
            );
            return;
          }
          totalKg += entry.kg;
        }
        const entity = w.createEntity();
        missions.set(entity, {
          manifest,
          arrivalTick: Math.max(arrivalTick, w.tickCount),
          repeatTicks: repeatTicks ?? 0,
          targetEntity,
          costUsd: totalKg * importCostPerKg(pack),
          deliveries: 0,
        });
      });

      world.registerCommandHandler(CMD_CANCEL_RESUPPLY, (w, payload) => {
        const { entity } = payload as { entity: number };
        if (!missions.has(entity)) {
          pushAlert(
            w,
            ALERTS_ENTITY,
            "warning",
            "cancel-rejected",
            `No mission on entity ${entity}`,
          );
          return;
        }
        w.destroyEntity(entity);
      });

      // Debug/testing hook until the M4 hazard engine rolls SPEs itself.
      world.registerCommandHandler(CMD_TRIGGER_SPE, (w, payload) => {
        const { mSv } = payload as { mSv: number };
        applySpeDose(w, pack, ids, mSv);
      });
    },
  };
}
