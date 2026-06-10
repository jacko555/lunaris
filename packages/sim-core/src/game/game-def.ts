import type { World } from "../ecs/world.js";
import type { WorldDef } from "../save.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId, JsonObject, JsonValue } from "../types.js";
import type { LunarMap } from "../map/tiles.js";
import { inBounds, tileAt } from "../map/tiles.js";
import {
  createConstructionSystem,
  instantiateBuilding,
  validatePlacement,
} from "../systems/construction.js";
import { createDustSystem } from "../systems/dust.js";
import { createEclssSystem } from "../systems/eclss.js";
import { createEconomySystem } from "../systems/economy.js";
import { createEnvironmentSystem } from "../systems/environment.js";
import { createHazardSystem } from "../systems/hazards.js";
import { createHealthSystem } from "../systems/health.js";
import { chargeLaunch, createLogisticsSystem, vehicleClass } from "../systems/logistics.js";
import { createFoodSystem } from "../systems/food.js";
import { createPhaseSystem } from "../systems/phase.js";
import { createPolicySystem } from "../systems/policy.js";
import { createPopulationSystem } from "../systems/population.js";
import { createPowerSystem } from "../systems/power.js";
import { createRivalSystem } from "../systems/rival.js";
import { applySpeDose, createRadiationSystem } from "../systems/radiation.js";
import { createReactionSystem } from "../systems/reactions.js";
import { createResearchSystem, hardPrereqsMet } from "../systems/research.js";
import { createStatsSystem } from "../systems/stats.js";
import { createThermalSystem } from "../systems/thermal.js";
import { pushAlert } from "./alerts.js";
import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  DUST_COMPONENT,
  ECONOMY_COMPONENT,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  PHASE_COMPONENT,
  POLICY_COMPONENT,
  RESEARCH_COMPONENT,
  RIVAL_COMPONENT,
  RESUPPLY_COMPONENT,
  SITE_COMPONENT,
  STATS_COMPONENT,
  STORAGE_COMPONENT,
  THERMAL_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type CrewComponent,
  type DustComponent,
  type EconomyComponent,
  type EnvironmentComponent,
  type GridComponent,
  type PendingHazardComponent,
  type PhaseComponent,
  type PolicyComponent,
  type ResearchComponent,
  type RivalComponent,
  type ResupplyComponent,
  type SiteComponent,
  type StatsComponent,
  type StorageComponent,
  type ThermalComponent,
} from "./components.js";

/**
 * The game world definition. Singleton entities: ENV (1) carries the
 * environment; GRID (2) doubles as the colony entity carrying grid, stats,
 * research, economy, and phase components; ALERTS (3) the alert log.
 * Systems run in the docs/TAD.md §3 registry order:
 * Environment → Power → Thermal → Reactions(ISRU) → Construction → ECLSS →
 * Crew (Radiation, Health) → Logistics → Research → Hazards(Events) →
 * Phase → Economy → Stats.
 *
 * Scenario config (world.config) keys read at setup:
 *   startTechs: string[]      pre-unlocked tech ids
 *   startBudgetUsd, annualBudgetUsd: numbers (default 0)
 *   startPhase: number        (default 0; outpost scenarios start at 2)
 *   failureTables: "ideal" | "realistic" (read live by hazards/logistics)
 */

export const ENV_ENTITY: EntityId = 1;
export const GRID_ENTITY: EntityId = 2;
export const ALERTS_ENTITY: EntityId = 3;
/** Colony-wide singletons (stats/research/economy/phase) live on GRID. */
export const COLONY_ENTITY: EntityId = GRID_ENTITY;

export const CMD_PLACE_BUILDING = "cmd-place-building";
export const CMD_QUEUE_BUILD = "cmd-queue-build";
export const CMD_CANCEL_BUILD = "cmd-cancel-build";
export const CMD_REMOVE_BUILDING = "cmd-remove-building";
export const CMD_ADD_CREW = "cmd-add-crew";
export const CMD_ASSIGN_CREW = "cmd-assign-crew";
export const CMD_SCHEDULE_RESUPPLY = "cmd-schedule-resupply";
export const CMD_CANCEL_RESUPPLY = "cmd-cancel-resupply";
export const CMD_START_RESEARCH = "cmd-start-research";
export const CMD_LAUNCH_PROBE = "cmd-launch-probe";
export const CMD_LAUNCH_SORTIE = "cmd-launch-sortie";
export const CMD_TRIGGER_SPE = "cmd-trigger-spe";
export const CMD_SET_POLICY = "cmd-set-policy";

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
  vehicle?: string;
  [key: string]: JsonValue;
}

function configValue(world: World, key: string): JsonValue | undefined {
  const config = world.config;
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return undefined;
  }
  return (config as JsonObject)[key];
}

export function createGameDef(pack: ContentPack, map: LunarMap): WorldDef {
  return {
    setup(world: World): void {
      const environments = world.registerComponent<EnvironmentComponent>(ENVIRONMENT_COMPONENT);
      const grids = world.registerComponent<GridComponent>(GRID_COMPONENT);
      const alerts = world.registerComponent<AlertsComponent>(ALERTS_COMPONENT);
      const buildings = world.registerComponent<BuildingComponent>(BUILDING_COMPONENT);
      world.registerComponent<ThermalComponent>(THERMAL_COMPONENT);
      world.registerComponent<StorageComponent>(STORAGE_COMPONENT);
      const crews = world.registerComponent<CrewComponent>(CREW_COMPONENT);
      const missions = world.registerComponent<ResupplyComponent>(RESUPPLY_COMPONENT);
      const sites = world.registerComponent<SiteComponent>(SITE_COMPONENT);
      world.registerComponent<DustComponent>(DUST_COMPONENT);
      const statsStore = world.registerComponent<StatsComponent>(STATS_COMPONENT);
      const researchStore = world.registerComponent<ResearchComponent>(RESEARCH_COMPONENT);
      const economyStore = world.registerComponent<EconomyComponent>(ECONOMY_COMPONENT);
      const phaseStore = world.registerComponent<PhaseComponent>(PHASE_COMPONENT);
      world.registerComponent<PendingHazardComponent>(PENDING_HAZARD_COMPONENT);
      const policyStore = world.registerComponent<PolicyComponent>(POLICY_COMPONENT);
      const rivalStore = world.registerComponent<RivalComponent>(RIVAL_COMPONENT);

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
      statsStore.set(COLONY_ENTITY, {
        cycleLocalKg: 0,
        cycleImportedKg: 0,
        lastCycleLocalShare: 0,
        cumulativeLocalKg: 0,
        cumulativeImportedKg: 0,
        isru50Milestone: 0,
        cycleAllLocalKg: 0,
        cycleAllImportedKg: 0,
        lastCycleClosure: 0,
      });
      const startTechs = (configValue(world, "startTechs") as string[] | undefined) ?? [];
      researchStore.set(COLONY_ENTITY, {
        sciencePoints: 0,
        unlocked: [...startTechs],
        current: "",
        progress: 0,
        setbackApplied: 0,
      });
      economyStore.set(COLONY_ENTITY, {
        balanceUsd: (configValue(world, "startBudgetUsd") as number | undefined) ?? 0,
        annualBudgetUsd: (configValue(world, "annualBudgetUsd") as number | undefined) ?? 0,
        totalLaunchSpendUsd: 0,
        totalOpsSpendUsd: 0,
        totalRevenueUsd: 0,
      });
      phaseStore.set(COLONY_ENTITY, {
        phase: (configValue(world, "startPhase") as number | undefined) ?? 0,
        successfulLandings: 0,
        iceCharacterized: 0,
        commsActive: 0,
        sortiesCompleted: 0,
        occupationTicks: 0,
        nightSurvived: 0,
        nightTicksWithCrew: 0,
        isruDemo: 0,
        phaseEnteredTick: 0,
        milestones: [],
      });
      // Simulation-mode decision maker (MODES.md §2.2), enabled by scenario.
      if ((configValue(world, "policyEnabled") as number | undefined) === 1) {
        const anchors = findPolicyAnchors(map);
        policyStore.set(COLONY_ENTITY, {
          enabled: 1,
          weights: (configValue(world, "policyWeights") as Record<string, number> | undefined) ?? {
            infrastructure: 1,
            isru: 1,
            science: 1,
            population: 1,
          },
          baseX: anchors.baseX,
          baseY: anchors.baseY,
          mineX: anchors.mineX,
          mineY: anchors.mineY,
          lastResupplyTick: -10000,
          lastCrewTick: -10000,
        });
      }
      const rivalName = configValue(world, "rivalName") as string | undefined;
      if (rivalName !== undefined) {
        rivalStore.set(COLONY_ENTITY, {
          name: rivalName,
          upcoming:
            (configValue(world, "rivalMilestones") as { tick: number; label: string }[]) ?? [],
        });
      }

      const ids = {
        envEntity: ENV_ENTITY,
        gridEntity: GRID_ENTITY,
        alertsEntity: ALERTS_ENTITY,
        colonyEntity: COLONY_ENTITY,
      };
      world.registerSystem(createEnvironmentSystem(pack, ENV_ENTITY));
      world.registerSystem(createPowerSystem(pack, map, ids));
      world.registerSystem(createThermalSystem(pack, map, ids));
      world.registerSystem(createReactionSystem(pack, map, ids));
      world.registerSystem(createConstructionSystem(pack, ids));
      world.registerSystem(createEclssSystem(pack, ids));
      world.registerSystem(createFoodSystem(pack, ids));
      world.registerSystem(createRadiationSystem(pack, ids));
      world.registerSystem(createHealthSystem(pack, ids));
      world.registerSystem(createPopulationSystem(pack, ids));
      world.registerSystem(createLogisticsSystem(pack, map, ids));
      world.registerSystem(createResearchSystem(pack, ids));
      world.registerSystem(createHazardSystem(pack, ids));
      world.registerSystem(createDustSystem(pack, ids));
      world.registerSystem(createPhaseSystem(pack, ids));
      world.registerSystem(createEconomySystem(pack, ids));
      world.registerSystem(createStatsSystem(pack, ids));
      world.registerSystem(createRivalSystem(pack, ids));
      world.registerSystem(createPolicySystem(pack, map, ids));

      const reject = (w: World, code: string, message: string): void => {
        pushAlert(w, ALERTS_ENTITY, "warning", code, message);
      };

      // ── building commands ──

      world.registerCommandHandler(CMD_PLACE_BUILDING, (w, payload) => {
        const { defId, x, y } = payload as CmdPlaceBuildingPayload;
        const problem = validatePlacement(w, pack, map, defId, x, y, COLONY_ENTITY);
        if (problem !== null) {
          reject(
            w,
            "placement-rejected",
            `Cannot place '${defId}' at (${x}, ${y}): ${problem.reason}`,
          );
          return;
        }
        instantiateBuilding(w, pack, defId, x, y);
        // Comms infrastructure satisfies the Phase-0 relay criterion.
        if (pack.building(defId).commsRelay) {
          phaseStore.require(COLONY_ENTITY).commsActive = 1;
        }
      });

      world.registerCommandHandler(CMD_QUEUE_BUILD, (w, payload) => {
        const { defId, x, y } = payload as CmdPlaceBuildingPayload;
        const problem = validatePlacement(w, pack, map, defId, x, y, COLONY_ENTITY);
        if (problem !== null) {
          reject(w, "build-rejected", `Cannot build '${defId}' at (${x}, ${y}): ${problem.reason}`);
          return;
        }
        const def = pack.building(defId);
        const entity = w.createEntity();
        sites.set(entity, {
          defId,
          x,
          y,
          progressHours: 0,
          totalHours: Math.max(
            1,
            (def.massKg / 1000) * pack.number("construction_hours_per_tonne"),
          ),
          recipe: "",
          paid: 0,
        });
        pushAlert(
          w,
          ALERTS_ENTITY,
          "info",
          "build-queued",
          `${def.name} queued at (${x}, ${y}) — materials will be drawn from stores when available`,
        );
      });

      world.registerCommandHandler(CMD_CANCEL_BUILD, (w, payload) => {
        const { entity } = payload as { entity: number };
        if (!sites.has(entity)) {
          reject(w, "cancel-rejected", `No construction site on entity ${entity}`);
          return;
        }
        w.destroyEntity(entity); // paid materials are lost (site scrap)
      });

      world.registerCommandHandler(CMD_REMOVE_BUILDING, (w, payload) => {
        const { entity } = payload as { entity: number };
        if (!buildings.has(entity)) {
          reject(w, "remove-rejected", `No building on entity ${entity}`);
          return;
        }
        w.destroyEntity(entity);
      });

      // ── crew commands ──

      /** -1 sentinel → first housing building at execution time (robust for
       * scripted scenarios where stochastic entities shift id arithmetic). */
      const resolveHousing = (location: number): number => {
        if (location !== -1) {
          return location;
        }
        for (const [entity, building] of buildings.entries()) {
          if ((pack.building(building.defId).services.housing ?? 0) > 0) {
            return entity;
          }
        }
        return -1;
      };
      const resolveTarget = (target: number): number => {
        if (target !== -1) {
          return target;
        }
        return (buildings.entities()[0] as number | undefined) ?? -1;
      };

      world.registerCommandHandler(CMD_ADD_CREW, (w, payload) => {
        const { name, skills } = payload as CmdAddCrewPayload;
        const location = resolveHousing((payload as CmdAddCrewPayload).location);
        const home = buildings.get(location);
        if (home === undefined || (pack.building(home.defId).services.housing ?? 0) <= 0) {
          reject(
            w,
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
          reject(w, "assign-rejected", `No living crew on entity ${crew}`);
          return;
        }
        if (location !== undefined) {
          if (!buildings.has(location)) {
            reject(
              w,
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

      // ── mission commands ──

      const scheduleMission = (
        w: World,
        kind: string,
        vehicleId: string,
        manifest: { resource: string; kg: number }[],
        arrivalTick: number,
        repeatTicks: number,
        targetEntity: number,
        targetX: number,
        targetY: number,
        payloadKg: number,
      ): boolean => {
        let vehicle;
        try {
          vehicle = vehicleClass(pack, vehicleId);
        } catch {
          reject(w, "mission-rejected", `Unknown vehicle class '${vehicleId}'`);
          return false;
        }
        if (payloadKg > vehicle.payloadKg) {
          reject(
            w,
            "mission-rejected",
            `${payloadKg.toFixed(0)} kg exceeds the ${vehicleId} payload cap (${vehicle.payloadKg} kg)`,
          );
          return false;
        }
        if (vehicleId === "starship") {
          const research = researchStore.require(COLONY_ENTITY);
          if (!research.unlocked.includes("orbital_refueling")) {
            reject(
              w,
              "mission-rejected",
              "Starship-class missions require orbital_refueling research",
            );
            return false;
          }
        }
        const costUsd = payloadKg * vehicle.usdPerKg;
        chargeLaunch(w, COLONY_ENTITY, costUsd);
        const entity = w.createEntity();
        missions.set(entity, {
          kind,
          vehicle: vehicleId,
          manifest,
          arrivalTick: Math.max(arrivalTick, w.tickCount + Math.round(vehicle.transitDays * 24)),
          repeatTicks,
          targetEntity,
          targetX,
          targetY,
          costUsd,
          deliveries: 0,
          failures: 0,
        });
        return true;
      };

      world.registerCommandHandler(CMD_SCHEDULE_RESUPPLY, (w, payload) => {
        const { manifest, arrivalTick, repeatTicks, vehicle } =
          payload as CmdScheduleResupplyPayload;
        const targetEntity = resolveTarget((payload as CmdScheduleResupplyPayload).targetEntity);
        if (!buildings.has(targetEntity)) {
          reject(
            w,
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
            reject(
              w,
              "resupply-rejected",
              `Unknown resource '${entry.resource}' in resupply manifest`,
            );
            return;
          }
          if (!(entry.kg > 0)) {
            reject(w, "resupply-rejected", "Manifest masses must be positive");
            return;
          }
          totalKg += entry.kg;
        }
        scheduleMission(
          w,
          "cargo",
          vehicle ?? "heavy",
          manifest,
          arrivalTick,
          repeatTicks ?? 0,
          targetEntity,
          0,
          0,
          totalKg,
        );
      });

      world.registerCommandHandler(CMD_CANCEL_RESUPPLY, (w, payload) => {
        const { entity } = payload as { entity: number };
        if (!missions.has(entity)) {
          reject(w, "cancel-rejected", `No mission on entity ${entity}`);
          return;
        }
        w.destroyEntity(entity);
      });

      world.registerCommandHandler(CMD_LAUNCH_PROBE, (w, payload) => {
        const { x, y } = payload as { x: number; y: number };
        if (!inBounds(map, x, y)) {
          reject(w, "mission-rejected", `Probe target (${x}, ${y}) is outside the map`);
          return;
        }
        void tileAt(map, x, y);
        scheduleMission(w, "probe", "clps", [], 0, 0, 0, x, y, pack.number("probe_payload_kg"));
      });

      world.registerCommandHandler(CMD_LAUNCH_SORTIE, (w) => {
        scheduleMission(
          w,
          "sortie",
          "heavy",
          [],
          w.tickCount + Math.round(pack.number("sortie_stay_days") * 24),
          0,
          0,
          0,
          0,
          pack.number("sortie_payload_kg"),
        );
      });

      // ── research ──

      world.registerCommandHandler(CMD_START_RESEARCH, (w, payload) => {
        const { techId } = payload as { techId: string };
        const research = researchStore.require(COLONY_ENTITY);
        let tech;
        try {
          tech = pack.techNode(techId);
        } catch {
          reject(w, "research-rejected", `Unknown tech '${techId}'`);
          return;
        }
        if (research.unlocked.includes(techId)) {
          reject(w, "research-rejected", `'${techId}' is already researched`);
          return;
        }
        if (!hardPrereqsMet(tech, research.unlocked)) {
          reject(w, "research-rejected", `'${techId}' prerequisites are not met`);
          return;
        }
        research.current = techId;
        research.progress = 0;
        research.setbackApplied = 0;
      });

      // Debug/testing hook until simulation-mode policy AI rolls its own.
      world.registerCommandHandler(CMD_TRIGGER_SPE, (w, payload) => {
        const { mSv } = payload as { mSv: number };
        applySpeDose(w, pack, ids, mSv);
      });

      // `Take Command` / advisor handoff (MODES.md §2.4): same world, the
      // only thing that changes is who issues commands.
      world.registerCommandHandler(CMD_SET_POLICY, (w, payload) => {
        const { enabled } = payload as { enabled: number };
        const policy = policyStore.get(COLONY_ENTITY);
        if (policy === undefined) {
          // Manual game that turns the AI on mid-run.
          const anchors = findPolicyAnchors(map);
          policyStore.set(COLONY_ENTITY, {
            enabled: enabled === 1 ? 1 : 0,
            weights: { infrastructure: 1, isru: 1, science: 1, population: 1 },
            baseX: anchors.baseX,
            baseY: anchors.baseY,
            mineX: anchors.mineX,
            mineY: anchors.mineY,
            lastResupplyTick: -10000,
            lastCrewTick: -10000,
          });
        } else {
          policy.enabled = enabled === 1 ? 1 : 0;
        }
        pushAlert(
          w,
          ALERTS_ENTITY,
          "info",
          "policy-toggle",
          enabled === 1 ? "Policy AI engaged — observer mode" : "You have command.",
        );
      });
    },
  };
}

/** Deterministic site selection for the Policy AI: flat plains + icy PSR. */
export function findPolicyAnchors(map: LunarMap): {
  baseX: number;
  baseY: number;
  mineX: number;
  mineY: number;
} {
  let baseX = 4;
  let baseY = 4;
  outer: for (let y = 2; y < map.height - 10; y++) {
    for (let x = 2; x < map.width - 14; x++) {
      let ok = true;
      for (let dy = 0; dy < 8 && ok; dy++) {
        for (let dx = 0; dx < 12 && ok; dx++) {
          const tile = tileAt(map, x + dx, y + dy);
          ok = tile.illumClass === "B" && tile.slopeDeg <= 5;
        }
      }
      if (ok) {
        baseX = x + 4;
        baseY = y + 4;
        break outer;
      }
    }
  }
  let mineX = baseX;
  let mineY = baseY;
  outer2: for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = tileAt(map, x, y);
      if (tile.illumClass === "C" && tile.iceFrac > 0.03 && tile.slopeDeg <= 15) {
        mineX = x;
        mineY = y;
        break outer2;
      }
    }
  }
  return { baseX, baseY, mineX, mineY };
}
