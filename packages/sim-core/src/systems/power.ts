import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  STORAGE_COMPONENT,
  THERMAL_COMPONENT,
  type BuildingComponent,
  type EnvironmentComponent,
  type GridComponent,
  type StorageComponent,
  type ThermalComponent,
} from "../game/components.js";

/**
 * PowerSystem (docs/SDD.md §3). Per tick (1 h, so kW ≡ kWh):
 *   generation = Σ producers (solar scaled by tile illumination & condition)
 *   demand     = Σ consumers by priority tier 0–3, plus tier-1 heater
 *                requests posted by ThermalSystem last tick
 *   deficit    → discharge storage; still short → shed tiers bottom-up
 *                (3 industry → 2 comfort → 1 thermal → 0 life-support)
 *   surplus    → charge storage at round-trip efficiency; rest curtailed
 *
 * Energy books must balance every tick:
 *   generation + discharge === supplied + chargeInput + curtailed
 */

export interface PowerSystemIds {
  envEntity: EntityId;
  gridEntity: EntityId;
  alertsEntity: EntityId;
}

export function createPowerSystem(pack: ContentPack, map: LunarMap, ids: PowerSystemIds): System {
  return {
    name: "power",
    update: (world) => {
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ids.envEntity);
      const grid = world.store<GridComponent>(GRID_COMPONENT).require(ids.gridEntity);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);
      const thermals = world.store<ThermalComponent>(THERMAL_COMPONENT);
      const storages = world.store<StorageComponent>(STORAGE_COMPONENT);

      const litByClass: Record<string, number> = { A: env.litA, B: env.litB, C: env.litC };

      // ── survey production and demand ──
      let generationKw = 0;
      const tierDemandKw = [0, 0, 0, 0];
      const dusts = world.store<{ frac: number }>("dust");
      for (const [entity, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (def.powerKw > 0) {
          const illumination = def.powerScalesWithIllumination
            ? (litByClass[tileAt(map, building.x, building.y).illumClass] as number)
            : 1;
          // Dust film on sensitive producers; scrams force producers offline.
          const dustFactor = def.dustSensitive ? 1 - (dusts.get(entity)?.frac ?? 0) : 1;
          const online = world.tickCount >= building.offlineUntilTick ? 1 : 0;
          generationKw += def.powerKw * illumination * building.condition * dustFactor * online;
          building.poweredFraction = 1;
        } else if (def.powerKw < 0 && building.condition > 0) {
          const tier = def.priorityTier as number;
          tierDemandKw[tier] = (tierDemandKw[tier] as number) - def.powerKw;
        }
        const thermal = thermals.get(entity);
        if (thermal !== undefined && building.condition > 0) {
          // SDD §5: heating is Tier-1 load.
          tierDemandKw[1] = (tierDemandKw[1] as number) + thermal.heaterRequestKw;
        }
      }
      const demandKw =
        (tierDemandKw[0] as number) +
        (tierDemandKw[1] as number) +
        (tierDemandKw[2] as number) +
        (tierDemandKw[3] as number);

      // ── storage discharge to cover any deficit ──
      let dischargeKw = 0;
      let deficitKw = demandKw - generationKw;
      if (deficitKw > 0) {
        for (const [entity, storage] of storages.entries()) {
          if (deficitKw <= 0) {
            break;
          }
          const building = buildings.get(entity);
          if (building === undefined || building.condition <= 0) {
            continue;
          }
          const draw = Math.min(deficitKw, storage.energyKwh);
          storage.energyKwh -= draw;
          dischargeKw += draw;
          deficitKw -= draw;
        }
      }

      // ── allocate to tiers, life-support first ──
      let availableKw = generationKw + dischargeKw;
      const tierFraction = [1, 1, 1, 1];
      let suppliedKw = 0;
      for (let tier = 0; tier <= 3; tier++) {
        const wanted = tierDemandKw[tier] as number;
        if (wanted <= 0) {
          continue;
        }
        const granted = Math.min(wanted, availableKw);
        tierFraction[tier] = granted / wanted;
        availableKw -= granted;
        suppliedKw += granted;
      }
      const unmetKw = demandKw - suppliedKw;

      // ── charge storage with surplus, curtail the rest ──
      let chargeKw = 0;
      let surplusKw = availableKw;
      if (surplusKw > 0) {
        for (const [entity, storage] of storages.entries()) {
          if (surplusKw <= 0) {
            break;
          }
          const building = buildings.get(entity);
          if (building === undefined || building.condition <= 0) {
            continue;
          }
          const def = pack.building(building.defId);
          const capacityKwh = def.storageKwh ?? 0;
          const efficiency = def.storageRoundTripEff ?? 1;
          const roomKwh = Math.max(0, capacityKwh - storage.energyKwh);
          const inputAccepted = Math.min(surplusKw, roomKwh / efficiency);
          storage.energyKwh += inputAccepted * efficiency;
          chargeKw += inputAccepted;
          surplusKw -= inputAccepted;
        }
      }
      const curtailedKw = surplusKw;

      // ── apply powered fractions to consumers ──
      for (const [, building] of buildings.entries()) {
        const def = pack.building(building.defId);
        if (def.powerKw < 0) {
          building.poweredFraction =
            building.condition > 0 ? (tierFraction[def.priorityTier as number] as number) : 0;
        } else if (def.powerKw === 0) {
          building.poweredFraction = building.condition > 0 ? 1 : 0;
        }
      }

      // ── bookkeeping + brownout alert edges ──
      let storedKwh = 0;
      let storageCapacityKwh = 0;
      for (const [entity, storage] of storages.entries()) {
        const building = buildings.get(entity);
        if (building === undefined) {
          continue;
        }
        storedKwh += storage.energyKwh;
        storageCapacityKwh += pack.building(building.defId).storageKwh ?? 0;
      }

      const wasBrownout = grid.brownout === 1;
      const isBrownout = unmetKw > 1e-9;
      if (isBrownout && !wasBrownout) {
        const shedTiers = tierFraction
          .map((f, tier) => (f < 1 ? tier : -1))
          .filter((tier) => tier >= 0);
        pushAlert(
          world,
          ids.alertsEntity,
          (shedTiers[0] as number) <= 1 ? "critical" : "warning",
          "brownout",
          `Power deficit: ${unmetKw.toFixed(1)} kW unmet, shedding tier(s) ${shedTiers.join(", ")}`,
        );
      } else if (!isBrownout && wasBrownout) {
        pushAlert(world, ids.alertsEntity, "info", "power-restored", "Power deficit resolved");
      }

      grid.generationKw = generationKw;
      grid.demandKw = demandKw;
      grid.suppliedKw = suppliedKw;
      grid.unmetKw = unmetKw;
      grid.chargeKw = chargeKw;
      grid.dischargeKw = dischargeKw;
      grid.curtailedKw = curtailedKw;
      grid.storedKwh = storedKwh;
      grid.storageCapacityKwh = storageCapacityKwh;
      grid.tierDemandKw = tierDemandKw;
      grid.tierFraction = tierFraction;
      grid.brownout = isBrownout ? 1 : 0;
    },
  };
}

/** Test/diagnostic helper: energy books for the last power pass. */
export function energyImbalanceKw(world: World, gridEntity: EntityId): number {
  const grid = world.store<GridComponent>(GRID_COMPONENT).require(gridEntity);
  return grid.generationKw + grid.dischargeKw - grid.suppliedKw - grid.chargeKw - grid.curtailedKw;
}
