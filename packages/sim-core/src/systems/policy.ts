import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { tileAt, type LunarMap } from "../map/tiles.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  ENVIRONMENT_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  PHASE_COMPONENT,
  POLICY_COMPONENT,
  RESEARCH_COMPONENT,
  RESUPPLY_COMPONENT,
  ROVER_COMPONENT,
  SITE_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type EconomyComponent,
  type EnvironmentComponent,
  type PendingHazardComponent,
  type PhaseComponent,
  type PolicyComponent,
  type ResearchComponent,
  type ResupplyComponent,
  type RoverComponent,
  type SiteComponent,
} from "../game/components.js";
import { colonyAmount } from "../game/pool.js";
import {
  R_FOOD,
  R_MACHINE_COMPONENTS,
  R_O2,
  R_SPARE_PARTS,
  R_WATER,
} from "../game/resource-ids.js";
import { vehicleClass } from "./logistics.js";
import { roverSpec } from "./rover.js";
import { hardPrereqsMet } from "./research.js";

/**
 * Policy AI (docs/MODES.md §2.2) — the simulation-mode decision maker. It
 * lives in sim-core, runs once per game-day, draws only from the world RNG,
 * and issues exactly the same commands a player would (enqueued for the
 * next tick, recorded in the input log) — so observer runs are replayable
 * and `Take Command` is just flipping `enabled` to 0.
 *
 * Daily passes: 1. Safety (SPE shelter orders, night-power readiness)
 * 2. Needs (consumable runway < 2 lunar days → resupply) 3. Growth (spend
 * by weights: infrastructure/isru/science/population) 4. Research (cheapest
 * tech that unblocks the next phase criterion).
 */

export interface PolicySystemIds {
  alertsEntity: EntityId;
  colonyEntity: EntityId;
}

/** Phase-targeted research order (criteria techs first, then enablers). */
const RESEARCH_PRIORITIES: string[] = [
  "precision_landing",
  "ice_prospecting",
  "surface_power_40kw",
  "eclss_baseline",
  "night_landing_nav",
  "ice_mining_pilot",
  "space_weather_forecasting",
  "regen_fuel_cells",
  "electrolysis_propellant",
  "dust_mitigation",
  "regolith_printing",
  "water_recovery_98",
  "sabatier_loop",
  "metal_refining",
  "mre_oxygen",
  "hydroponics_pilot",
  "heavy_cargo_lander",
  "automation_robotics",
  "advanced_manufacturing",
  "bioregenerative_ls",
  "surgical_medicine",
  "partial_g_countermeasures",
  "orbital_refueling",
  "fission_cluster",
  "mass_driver",
  "volatile_combine",
];

const CREW_RATE_KG_DAY = { o2: 0.84, water: 7.04, food: 0.62 };

function builtCount(world: World, defId: string): number {
  let n = 0;
  for (const [, b] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
    if (b.defId === defId) {
      n++;
    }
  }
  for (const [, s] of world.store<SiteComponent>(SITE_COMPONENT).entries()) {
    if (s.defId === defId) {
      n++;
    }
  }
  return n;
}

/** First free flat tile near the base anchor (deterministic spiral scan). */
function findSpot(
  world: World,
  pack: ContentPack,
  map: LunarMap,
  policy: PolicyComponent,
  defId: string,
): { x: number; y: number } | null {
  const def = pack.building(defId);
  const occupied = new Set<string>();
  const mark = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }
  };
  for (const [, b] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
    const [w, h] = pack.building(b.defId).footprint;
    mark(b.x, b.y, w, h);
  }
  for (const [, s] of world.store<SiteComponent>(SITE_COMPONENT).entries()) {
    const [w, h] = pack.building(s.defId).footprint;
    mark(s.x, s.y, w, h);
  }
  const anchorX = def.placement.requiresPSR ? policy.mineX : policy.baseX;
  const anchorY = def.placement.requiresPSR ? policy.mineY : policy.baseY;
  const [fw, fh] = def.footprint;
  for (let radius = 0; radius < 18; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const x = anchorX + dx;
        const y = anchorY + dy;
        if (x < 0 || y < 0 || x + fw > map.width || y + fh > map.height) {
          continue;
        }
        let ok = true;
        for (let oy = 0; oy < fh && ok; oy++) {
          for (let ox = 0; ox < fw && ok; ox++) {
            const tile = tileAt(map, x + ox, y + oy);
            ok =
              !occupied.has(`${x + ox},${y + oy}`) &&
              tile.slopeDeg <= def.placement.maxSlope &&
              def.placement.terrain.includes(tile.regolith) &&
              (def.placement.requiresPSR ? tile.illumClass === "C" : tile.illumClass !== "C");
          }
        }
        if (ok) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

export function createPolicySystem(pack: ContentPack, map: LunarMap, ids: PolicySystemIds): System {
  const ticksPerLunarDay = Math.round(pack.number("day_synodic") * 24);

  return {
    name: "policy",
    update: (world) => {
      const policy = world.store<PolicyComponent>(POLICY_COMPONENT).get(ids.colonyEntity);
      if (policy === undefined || policy.enabled !== 1 || world.tickCount % 24 !== 12) {
        return; // daily pass at local "noon" offset
      }
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(ids.colonyEntity);
      const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(ids.colonyEntity);
      const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(ids.colonyEntity);
      const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(1);
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
      const pendings = world.store<PendingHazardComponent>(PENDING_HAZARD_COMPONENT);

      let living = 0;
      const livingIds: EntityId[] = [];
      for (const [entity, crew] of crews.entries()) {
        if (crew.alive === 1) {
          living++;
          livingIds.push(entity);
        }
      }
      const unlocked = (id: string): boolean => research.unlocked.includes(id);
      const canSpend = economy.balanceUsd > 1e9; // keep a reserve
      const knows = (defId: string): boolean => {
        // The AI's build tables reference base-pack ids; mods that remove
        // them simply prune those orders.
        try {
          pack.building(defId);
          return true;
        } catch {
          return false;
        }
      };
      const queue = (defId: string): boolean => {
        if (!knows(defId)) {
          return false;
        }
        const spot = findSpot(world, pack, map, policy, defId);
        if (spot === null) {
          return false;
        }
        world.enqueueCommand("cmd-queue-build", { defId, x: spot.x, y: spot.y });
        return true;
      };
      const cargoInFlight = missions.size;

      // ── 0. research pass (runs even when build tables are pruned) ──
      if (research.current === "") {
        for (const techId of RESEARCH_PRIORITIES) {
          if (unlocked(techId)) {
            continue;
          }
          let tech;
          try {
            tech = pack.techNode(techId);
          } catch {
            continue;
          }
          if (hardPrereqsMet(tech, research.unlocked)) {
            world.enqueueCommand("cmd-start-research", { techId });
            break;
          }
        }
      }

      // ── 1. safety pass ──
      let speIncoming = false;
      for (const [, pending] of pendings.entries()) {
        if (pending.eventId.startsWith("spe")) {
          speIncoming = true;
        }
      }
      const shelters = [...world.store<BuildingComponent>(BUILDING_COMPONENT).entries()]
        .filter(([, b]) => (pack.building(b.defId).services.shelter ?? 0) > 0)
        .map(([entity]) => entity);
      const habs = [...world.store<BuildingComponent>(BUILDING_COMPONENT).entries()]
        .filter(([, b]) => (pack.building(b.defId).services.housing ?? 0) > 0)
        .map(([entity]) => entity);
      if (speIncoming && shelters.length > 0) {
        for (const crewEntity of livingIds) {
          world.enqueueCommand("cmd-assign-crew", {
            crew: crewEntity,
            location: shelters[0] as number,
          });
        }
      } else if (!speIncoming && habs.length > 0) {
        for (const crewEntity of livingIds) {
          const member = crews.require(crewEntity);
          if (shelters.includes(member.location)) {
            world.enqueueCommand("cmd-assign-crew", {
              crew: crewEntity,
              location: habs[0] as number,
            });
          }
        }
      }
      // Night-power readiness: fission before the dark, or stay uncrewed.
      if (
        living > 0 &&
        env.lunarPhase > 0.3 &&
        unlocked("surface_power_40kw") &&
        knows("fission-surface-power") &&
        builtCount(world, "fission-surface-power") === 0 &&
        canSpend
      ) {
        queue("fission-surface-power");
      }

      // ── 2. needs pass ──
      if (living > 0 && world.tickCount - policy.lastResupplyTick > ticksPerLunarDay / 2) {
        const runwayDays = (resource: string, ratePerCrew: number): number =>
          colonyAmount(world, resource) / Math.max(0.001, living * ratePerCrew);
        const needFood = runwayDays(R_FOOD, CREW_RATE_KG_DAY.food) < 59;
        const needWater = runwayDays(R_WATER, CREW_RATE_KG_DAY.water) < 30;
        const needO2 = runwayDays(R_O2, CREW_RATE_KG_DAY.o2) < 30;
        const needParts = colonyAmount(world, R_SPARE_PARTS) < 200;
        // Survival shipments run down to a far lower floor than growth —
        // a launch-broke colony skips habs, not dinners (48 settlers
        // starved in the soak run while canSpend held the food budget).
        const canFeed = economy.balanceUsd > 1e8;
        if ((needFood || needWater || needO2 || needParts) && cargoInFlight < 3 && canFeed) {
          // Priority-ordered and clamped to one heavy lander: at large
          // populations the naive manifest (water alone: 7 kg/person-day)
          // overflows the payload and the whole order is rejected.
          let remaining = vehicleClass(pack, "heavy").payloadKg;
          const manifest: { resource: string; kg: number }[] = [];
          const push = (resource: string, kg: number): void => {
            const clamped = Math.min(Math.ceil(kg), Math.floor(remaining));
            if (clamped > 0) {
              manifest.push({ resource, kg: clamped });
              remaining -= clamped;
            }
          };
          if (needFood) {
            push(R_FOOD, living * 0.62 * 45);
          }
          if (needO2) {
            push(R_O2, living * 0.84 * 45);
          }
          push("medkits", 5);
          if (needParts) {
            push(R_SPARE_PARTS, 400);
          }
          if (needWater) {
            push(R_WATER, living * 7.04 * 35);
          }
          world.enqueueCommand("cmd-schedule-resupply", {
            manifest,
            arrivalTick: 0,
            targetEntity:
              habs[0] ??
              (world.store<BuildingComponent>(BUILDING_COMPONENT).entities()[0] as number),
            vehicle: "heavy",
          });
          policy.lastResupplyTick = world.tickCount;
        }
      }

      // ── 3. growth pass (weights gate how aggressively each lane runs) ──
      const w = policy.weights;
      if (canSpend) {
        if (phase.phase === 0) {
          // The very first CLPS lander arrives as an integrated unit — the
          // comms relay that everything afterwards is delivered against.
          if (world.store<BuildingComponent>(BUILDING_COMPONENT).size === 0) {
            if (knows("comms-tower")) {
              world.enqueueCommand("cmd-place-building", commsSpot(world, pack, map, policy));
            }
            return;
          }
          // Bootstrap: components cargo feeds the robotic ground segment.
          if (colonyAmount(world, R_MACHINE_COMPONENTS) < 1000 && cargoInFlight < 2) {
            const firstBuilding = world
              .store<BuildingComponent>(BUILDING_COMPONENT)
              .entities()[0] as number;
            world.enqueueCommand("cmd-schedule-resupply", {
              manifest: [{ resource: R_MACHINE_COMPONENTS, kg: 5000 }],
              arrivalTick: 0,
              targetEntity: firstBuilding,
              vehicle: "heavy",
            });
          }
          for (const [defId, want] of [
            ["comms-tower", 1],
            ["solar-array-10kw", 2],
            ["field-lab", 2],
            ["rtg-keepalive", 4],
          ] as [string, number][]) {
            if (knows(defId) && builtCount(world, defId) < want) {
              queue(defId);
              break;
            }
          }
          if (phase.successfulLandings < 2 || phase.iceCharacterized === 0) {
            if (cargoInFlight < 3) {
              world.enqueueCommand("cmd-launch-probe", { x: policy.mineX, y: policy.mineY });
            }
          }
          // Prospector rover: ground truth on the ice deposit (M-Rover).
          // Ordered once; every idle full-charge unit gets sent to the mine
          // anchor until the deposit is characterized.
          const rovers = world.store<RoverComponent>(ROVER_COMPONENT);
          if (phase.iceCharacterized === 0) {
            if (rovers.size === 0 && world.store<BuildingComponent>(BUILDING_COMPONENT).size > 0) {
              world.enqueueCommand("cmd-order-rover", { kind: "prospector" });
            }
            for (const [entity, rover] of rovers.entries()) {
              if (rover.state === 0 && rover.batteryKwh >= roverSpec(pack, rover.kind).batteryKwh) {
                world.enqueueCommand("cmd-launch-expedition", {
                  rover: entity,
                  x: policy.mineX,
                  y: policy.mineY,
                });
                break;
              }
            }
          }
        } else if (phase.phase === 1) {
          if (cargoInFlight < 1 && phase.sortiesCompleted < 2) {
            world.enqueueCommand("cmd-launch-sortie", {});
          }
        } else {
          // Phase 2+: outpost & industry by weights.
          if ((w["infrastructure"] ?? 1) > 0) {
            // The floor must cover queued-but-unpaid sites, or an expensive
            // build (fission: 6 t) deadlocks below the reorder threshold —
            // and every settler party then dies in the first unpowered night.
            let pendingKg = 0;
            for (const [, s] of world.store<SiteComponent>(SITE_COMPONENT).entries()) {
              if (s.paid === 0) {
                for (const entry of pack.building(s.defId).buildCost.imported) {
                  if (entry.resource === R_MACHINE_COMPONENTS) {
                    pendingKg += entry.kg;
                  }
                }
              }
            }
            if (colonyAmount(world, R_MACHINE_COMPONENTS) < 3000 + pendingKg && cargoInFlight < 3) {
              world.enqueueCommand("cmd-schedule-resupply", {
                manifest: [{ resource: R_MACHINE_COMPONENTS, kg: 11000 }],
                arrivalTick: 0,
                targetEntity:
                  habs[0] ??
                  (world.store<BuildingComponent>(BUILDING_COMPONENT).entities()[0] as number),
                vehicle: "heavy",
              });
            }
            // Radiators scale with waste heat; reactors with night demand.
            let heatKw = 0;
            let demandKw = 0;
            for (const [, b] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
              const bd = pack.building(b.defId);
              heatKw += bd.heatKw;
              if (bd.powerKw < 0) {
                demandKw -= bd.powerKw;
              }
            }
            const fissionKw = knows("fission-surface-power")
              ? pack.building("fission-surface-power").powerKw
              : 40;
            for (const [defId, want] of [
              // Night power FIRST, scaled to ~80% of installed demand (the
              // grid sheds tier-3 loads at night, but ECLSS + heaters must
              // hold for 354 h) — a single 40 kW unit froze a 25-building
              // base solid at t6871 of the ideal-trajectory soak run.
              [
                "fission-surface-power",
                unlocked("surface_power_40kw")
                  ? Math.max(1, Math.ceil((demandKw * 0.8) / fissionKw))
                  : 0,
              ],
              ["foundation-habitat", Math.ceil(Math.max(4, living + 2) / 4)],
              ["radiator-wing", Math.max(2, Math.ceil(heatKw / 12))],
              // Storage ride-through (a live Phase-3 base was observed at
              // 0/0 kWh stored): ~4 hours of installed demand in batteries
              // for scram/outage gaps, plus one RFC when unlocked.
              [
                "battery-bank",
                knows("battery-bank")
                  ? Math.min(
                      8,
                      Math.max(
                        1,
                        Math.ceil(
                          (demandKw * 4) /
                            Math.max(1, pack.building("battery-bank").storageKwh ?? 100),
                        ),
                      ),
                    )
                  : 0,
              ],
              ["regen-fuel-cell", unlocked("regen_fuel_cells") ? 1 : 0],
              ["eclss-core", 1 + Math.ceil(Math.max(1, living / 6))],
              ["storm-shelter", 1],
              ["water-gas-storage", 1],
              ["exercise-module", Math.ceil(Math.max(1, living / 4))],
              ["clinic", 1],
              ["comms-tower", 1],
            ] as [string, number][]) {
              if (knows(defId) && builtCount(world, defId) < want) {
                queue(defId);
                break; // one build order per lane per day
              }
            }
          }
          if ((w["isru"] ?? 1) > 0 && unlocked("ice_mining_pilot")) {
            for (const defId of [
              "ice-harvester",
              "volatile-oven",
              ...(unlocked("electrolysis_propellant")
                ? ["electrolyzer", "cryo-plant", "propellant-depot-pad"]
                : []),
              ...(unlocked("regolith_printing") ? ["regolith-printer", "landing-pad"] : []),
              ...(unlocked("metal_refining") ? ["refinery", "workshop"] : []),
              ...(unlocked("hydroponics_pilot") ? ["greenhouse-module"] : []),
            ]) {
              if (knows(defId) && builtCount(world, defId) < 1) {
                queue(defId);
                break;
              }
            }
          }
          if ((w["science"] ?? 1) > 0 && knows("field-lab") && builtCount(world, "field-lab") < 3) {
            queue("field-lab");
          }
          if (
            (w["population"] ?? 1) > 0 &&
            world.tickCount - policy.lastCrewTick > ticksPerLunarDay
          ) {
            let housing = 0;
            // Night-capable generation must be BUILT — builtCount also counts
            // queued sites, and a settler party landed against a half-built
            // fission plant dies in the first 354-hour night.
            let nightPowerKw = 0;
            for (const [, b] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
              const bd = pack.building(b.defId);
              housing += bd.services.housing ?? 0;
              if (bd.powerKw > 0 && bd.powerScalesWithIllumination !== true) {
                nightPowerKw += bd.powerKw;
              }
            }
            const eclssOnline = knows("eclss-core") && builtCount(world, "eclss-core") > 0;
            // Provision for the INCOMING party, not the current roster —
            // otherwise an uncrewed base never orders food and never lands
            // anyone (the needs pass only feeds the living).
            const party = Math.min(4, Math.max(0, housing - living));
            const expected = living + party;
            const foodRunway = colonyAmount(world, R_FOOD) / Math.max(1, expected * 0.62);
            if (
              phase.phase >= 2 &&
              eclssOnline &&
              nightPowerKw >= 10 &&
              party > 0 &&
              habs.length > 0
            ) {
              if (
                foodRunway > 45 &&
                colonyAmount(world, R_O2) > expected * 0.84 * 10 &&
                // Water too — settlers landed onto a dry base die of thirst
                // in days, and the AI would re-land a doomed party every
                // cooldown without ever noticing why.
                colonyAmount(world, R_WATER) > expected * 7.04 * 10
              ) {
                for (let i = 0; i < party; i++) {
                  world.enqueueCommand("cmd-add-crew", {
                    name: `Settler-${world.tickCount}-${i}`,
                    skills: { engineer: 2, scientist: 1 },
                    location: habs[0] as number,
                  });
                }
                policy.lastCrewTick = world.tickCount;
              } else if (cargoInFlight < 3) {
                // Priority-clamped to one heavy lander (same rule as the
                // needs pass — an oversized manifest is rejected wholesale).
                let remaining = vehicleClass(pack, "heavy").payloadKg;
                const manifest: { resource: string; kg: number }[] = [];
                const push = (resource: string, kg: number): void => {
                  const clamped = Math.min(Math.ceil(kg), Math.floor(remaining));
                  if (clamped > 0) {
                    manifest.push({ resource, kg: clamped });
                    remaining -= clamped;
                  }
                };
                push(R_FOOD, expected * 0.62 * 120);
                push(R_O2, expected * 0.84 * 60);
                push("medkits", 10);
                push(R_SPARE_PARTS, 400);
                push(R_WATER, expected * 7.04 * 40);
                world.enqueueCommand("cmd-schedule-resupply", {
                  manifest,
                  arrivalTick: 0,
                  targetEntity: habs[0] as number,
                  vehicle: "heavy",
                });
                // Land the party two days behind their supplies — waiting
                // for a quiet noon never comes on a base whose propellant
                // plant drinks every water delivery (now reserve-capped,
                // but only once someone is alive to reserve for). The rare
                // realistic-tables cargo failure is survivable: the needs
                // pass rushes consumables the day the party lands.
                const transitTicks = Math.round(vehicleClass(pack, "heavy").transitDays * 24) + 48;
                for (let i = 0; i < party; i++) {
                  world.enqueueCommand(
                    "cmd-add-crew",
                    {
                      name: `Settler-${world.tickCount}-${i}`,
                      skills: { engineer: 2, scientist: 1 },
                      location: habs[0] as number,
                    },
                    world.tickCount + transitTicks,
                  );
                }
                policy.lastCrewTick = world.tickCount; // cooldown the order too
              }
            }
          }
        }
      }
    },
  };
}

function commsSpot(
  world: World,
  pack: ContentPack,
  map: LunarMap,
  policy: PolicyComponent,
): { defId: string; x: number; y: number } {
  const spot = findSpot(world, pack, map, policy, "comms-tower") ?? {
    x: policy.baseX,
    y: policy.baseY,
  };
  return { defId: "comms-tower", ...spot };
}
