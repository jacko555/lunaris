import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type EnvironmentComponent,
  type GridComponent,
  type ThermalComponent,
} from "../game/components.js";

/**
 * ThermalSystem (docs/SDD.md §5), per building each tick (1 h):
 *
 *   gains  = waste heat (heatKw × poweredFraction) + delivered heater power
 *   losses = leak U×(T − T_env) + radiator rejection
 *   ΔT     = net / thermalMass        (mass × specific heat)
 *
 * Radiators throttle: they reject only what is needed to hold the target
 * temperature, capped by own capacity plus the shared radiator-wing pool
 * (×1.6 effective at night against the 100 K sink). Heater demand for the
 * NEXT tick is posted as a request that PowerSystem treats as Tier-1 load —
 * a deliberate 1-tick lag that keeps system order (Env → Power → Thermal)
 * deterministic.
 *
 * State machine: NOMINAL → OVERHEAT (>temp_overheat) / FREEZE (<temp_freeze),
 * both eroding condition at thermal_damage_rate_per_hour.
 */

export interface ThermalSystemIds {
  envEntity: EntityId;
  gridEntity: EntityId;
  alertsEntity: EntityId;
}

export function createThermalSystem(
  pack: ContentPack,
  map: LunarMap,
  ids: ThermalSystemIds,
): System {
  const targetK = pack.number("temp_internal_target");
  const freezeK = pack.number("temp_freeze");
  const overheatK = pack.number("temp_overheat");
  const leakKwPerKPerTonne = pack.number("thermal_leak_kw_per_k_per_tonne");
  const specificHeatKjPerKgK = pack.number("building_specific_heat");
  const heaterMaxKw = pack.number("heater_max_kw");
  const damageRatePerHour = pack.number("thermal_damage_rate_per_hour");
  const nightMultiplier = pack.number("radiator_night_multiplier");

  return {
    name: "thermal",
    update: (world, dtHours) => {
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ids.envEntity);
      const grid = world.store<GridComponent>(GRID_COMPONENT).require(ids.gridEntity);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);

      const radiatorEffectiveness = env.isNight === 1 ? nightMultiplier : 1;

      // Shared rejection pool from powered radiator wings (kW).
      let poolKw = 0;
      for (const [entity, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (def.radiatorShared && def.radiatorKw > 0 && thermals.has(entity)) {
          poolKw +=
            def.radiatorKw * radiatorEffectiveness * building.poweredFraction * building.condition;
        }
      }

      const tier1Fraction = grid.tierFraction[1] as number;

      for (const [entity, thermal] of thermals.entries()) {
        const building = buildings.get(entity);
        if (building === undefined) {
          continue;
        }
        const def = pack.building(building.defId);
        const tile = tileAt(map, building.x, building.y);
        const envTempK = tile.illumClass === "C" ? env.tempPsrK : env.tempSurfaceK;
        const thermalMassKwhPerK = (def.massKg * specificHeatKjPerKgK) / 3600;
        // Envelope conductance scales with building size.
        const leakKwPerK = leakKwPerKPerTonne * (def.massKg / 1000);

        const wasteKw = Math.max(0, def.heatKw) * building.poweredFraction * building.condition;
        thermal.heaterDeliveredKw = thermal.heaterRequestKw * tier1Fraction;
        const leakKw = leakKwPerK * (thermal.tempK - envTempK);

        // Radiator control: hold the target if capacity allows.
        const ownCapKw = def.radiatorShared
          ? 0
          : def.radiatorKw * radiatorEffectiveness * building.condition;
        const excessKw =
          wasteKw +
          thermal.heaterDeliveredKw -
          leakKw +
          ((thermal.tempK - targetK) * thermalMassKwhPerK) / dtHours;
        let rejectKw = Math.max(0, Math.min(excessKw, ownCapKw));
        if (excessKw > rejectKw && poolKw > 0) {
          const fromPool = Math.min(excessKw - rejectKw, poolKw);
          rejectKw += fromPool;
          poolKw -= fromPool;
        }

        const netKw = wasteKw + thermal.heaterDeliveredKw - leakKw - rejectKw;
        thermal.tempK += (netKw * dtHours) / thermalMassKwhPerK;

        // Post next tick's heater request: steady-state leak compensation
        // plus catch-up toward target, capped by the building's heater.
        const steadyKw = leakKwPerK * (targetK - envTempK) - wasteKw;
        const catchUpKw = ((targetK - thermal.tempK) * thermalMassKwhPerK) / dtHours;
        thermal.heaterRequestKw = Math.min(heaterMaxKw, Math.max(0, steadyKw + catchUpKw));

        // State machine + damage.
        const previousState = thermal.state;
        const state =
          thermal.tempK < freezeK ? "freeze" : thermal.tempK > overheatK ? "overheat" : "nominal";
        thermal.state = state;
        if (state !== "nominal") {
          building.condition = Math.max(0, building.condition - damageRatePerHour * dtHours);
        }
        if (state !== previousState) {
          if (state === "freeze") {
            pushAlert(
              world,
              ids.alertsEntity,
              "critical",
              "freeze",
              `${def.name} internal temperature ${thermal.tempK.toFixed(0)} K — water systems offline, taking damage`,
            );
          } else if (state === "overheat") {
            pushAlert(
              world,
              ids.alertsEntity,
              "warning",
              "overheat",
              `${def.name} internal temperature ${thermal.tempK.toFixed(0)} K — efficiency loss, taking damage`,
            );
          } else {
            pushAlert(
              world,
              ids.alertsEntity,
              "info",
              "thermal-nominal",
              `${def.name} back to nominal temperature`,
            );
          }
        }
      }
    },
  };
}
