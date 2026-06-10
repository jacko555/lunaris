import type { System } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  PHASE_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type EconomyComponent,
  type PhaseComponent,
} from "../game/components.js";
import { colonyConsume } from "../game/pool.js";
import { R_LOX } from "../game/resource-ids.js";

/**
 * Budget & economy (TASKS.md M5, ECONOMY.md §4). Income: the scenario's
 * annual appropriation, accrued per tick, plus Phase-3 propellant sales
 * (a powered depot auto-sells LOX into a fixed daily demand — the revenue
 * hook; elastic markets arrive M7). Expenses: ops cost per crew-day;
 * launch costs are charged by logistics when missions are scheduled.
 * Negative balance alerts (the configurable lose condition lives in the
 * UI/scenario layer, GDD §6).
 */

export interface EconomySystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

export function createEconomySystem(pack: ContentPack, ids: EconomySystemIds): System {
  const opsUsdPerCrewDay = pack.number("crew_ops_usd_per_day");
  const loxPriceUsdPerKg = pack.number("lox_price_usd_per_kg");
  const loxDemandKgPerDay = pack.number("lox_demand_kg_per_day");

  return {
    name: "economy",
    update: (world) => {
      const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(ids.colonyEntity);
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const buildings = world.store<BuildingComponent>(BUILDING_COMPONENT);

      const before = economy.balanceUsd;

      // Appropriation accrues hourly.
      economy.balanceUsd += economy.annualBudgetUsd / 8760;

      // Ops cost per living crew member.
      let living = 0;
      for (const [, crew] of crews.entries()) {
        if (crew.alive === 1) {
          living++;
        }
      }
      const opsUsd = (living * opsUsdPerCrewDay) / 24;
      economy.balanceUsd -= opsUsd;
      economy.totalOpsSpendUsd += opsUsd;

      // Phase-3 propellant sales: powered depot sells LOX into daily demand.
      if (phase.phase >= 3) {
        let depotDuty = 0;
        for (const [, building] of buildings.entries()) {
          if (pack.building(building.defId).propellantDepot) {
            depotDuty = Math.max(depotDuty, building.poweredFraction * building.condition);
          }
        }
        if (depotDuty > 0) {
          const soldKg = colonyConsume(
            world,
            R_LOX,
            (loxDemandKgPerDay / 24) * depotDuty,
            "propellant-sale",
          );
          if (soldKg > 0) {
            const revenue = soldKg * loxPriceUsdPerKg;
            economy.balanceUsd += revenue;
            economy.totalRevenueUsd += revenue;
          }
        }
      }

      if (before >= 0 && economy.balanceUsd < 0) {
        pushAlert(
          world,
          ids.alertsEntity,
          "critical",
          "budget-negative",
          "Budget is in the red — cut launch cadence or start selling propellant before the program is cancelled",
        );
      }
    },
  };
}
