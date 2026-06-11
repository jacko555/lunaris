import type { System, World } from "../ecs/world.js";
import type { ContentPack } from "../schema/content-pack.js";
import type { EntityId } from "../types.js";
import { pushAlert } from "../game/alerts.js";
import {
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
} from "../game/components.js";
import { adjacentBermShielding } from "./construction.js";
import { compareStrings } from "../stable-stringify.js";

/**
 * Radiation system (docs/SDD.md §4).
 *
 * Chronic GCR: dose_surface_chronic mSv/day ÷ 24 per tick, scaled by the
 * shielding factor S(g/cm²) of the crew member's building — a lookup curve
 * with the published secondary-neutron bump at intermediate areal density
 * (45–105 g/cm² is WORSE than 10–20). EVA crew are unshielded.
 *
 * Doses land in a rolling 30-daily-bucket window; exceeding the NASA
 * 250 mSv 30-day limit applies a radiation-sickness debuff that
 * HealthSystem converts to damage. Career dose beyond 600 mSv flags a
 * forced-return condition (acted on by logistics from M5; until then a
 * standing critical alert).
 *
 * SPE doses are applied by `applySpeDose` (invoked by the M4 hazard engine
 * or the cmd-trigger-spe debug command): unshielded crew take the full
 * 100–500 mSv; ≥ spe_shelter_safe (10 g/cm²) caps the dose at ≤10 mSv per
 * the SDD shelter rule, with linear interpolation below that.
 */

export interface RadiationSystemIds {
  alertsEntity: EntityId;
}

/** Piecewise-linear S(arealDensity g/cm²) from a sorted anchor table. */
export function shieldingFactor(curve: [number, number][], gcm2: number): number {
  if (curve.length === 0) {
    return 1;
  }
  const first = curve[0] as [number, number];
  if (gcm2 <= first[0]) {
    return first[1];
  }
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i] as [number, number];
    const [x0, y0] = curve[i - 1] as [number, number];
    if (gcm2 <= x1) {
      return y0 + ((y1 - y0) * (gcm2 - x0)) / (x1 - x0);
    }
  }
  return (curve[curve.length - 1] as [number, number])[1];
}

/** Parse the radiation_shielding_curve composite constant into sorted anchors. */
export function loadShieldingCurve(pack: ContentPack): [number, number][] {
  const value = pack.constant("radiation_shielding_curve").value;
  if (typeof value === "number") {
    throw new Error("radiation_shielding_curve must be a composite constant");
  }
  return Object.keys(value)
    .sort(compareStrings)
    .map((key) => [Number(key.replace("g", "")), value[key] as number] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}

function crewShieldingGcm2(world: World, pack: ContentPack, crew: CrewComponent): number {
  if (crew.eva === 1) {
    return 0;
  }
  const building = world.store<BuildingComponent>(BUILDING_COMPONENT).get(crew.location);
  if (building === undefined) {
    return 0;
  }
  // Regolith berms add their areal density to adjacent structures (M4).
  return pack.building(building.defId).shieldingGcm2 + adjacentBermShielding(world, pack, building);
}

export function createRadiationSystem(pack: ContentPack, ids: RadiationSystemIds): System {
  const chronicPerTick = pack.number("dose_surface_chronic") / 24;
  const limit30Day = pack.number("dose_limit_30day");
  const careerLimit = pack.number("dose_career_limit");
  const curve = loadShieldingCurve(pack);

  return {
    name: "radiation",
    update: (world) => {
      const crews = world.store<CrewComponent>(CREW_COMPONENT);
      const day = Math.floor(world.tickCount / 24);
      const bucket = day % 30;
      // Pre-clear TOMORROW's bucket on the last tick of each day, so doses
      // applied during tomorrow's command phase (e.g. an SPE at tick start)
      // are never wiped by the recycle.
      const lastTickOfDay = world.tickCount % 24 === 23;

      for (const [, crew] of crews.entries()) {
        if (crew.alive !== 1) {
          continue;
        }
        const factor = shieldingFactor(curve, crewShieldingGcm2(world, pack, crew));
        const doseMSv = chronicPerTick * factor;
        crew.dose30d[bucket] = (crew.dose30d[bucket] ?? 0) + doseMSv;
        crew.doseCareerMSv += doseMSv;
        if (lastTickOfDay) {
          crew.dose30d[(day + 1) % 30] = 0;
        }

        const rolling = crew.dose30d.reduce((sum, d) => sum + d, 0);
        const sick = rolling > limit30Day ? 1 : 0;
        if (sick === 1 && crew.radiationSick === 0) {
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            "radiation-sickness",
            `${crew.name} exceeded the 30-day dose limit (${rolling.toFixed(0)}/${limit30Day} mSv) — keep them in shielded volumes until the rolling window clears`,
          );
        }
        crew.radiationSick = sick;

        if (crew.doseCareerMSv > careerLimit && crew.doseCareerMSv - doseMSv <= careerLimit) {
          pushAlert(
            world,
            ids.alertsEntity,
            "critical",
            "career-dose-exceeded",
            `${crew.name} passed the ${careerLimit} mSv career limit — flight rules require Earth return (rotation arrives with logistics M5)`,
          );
        }
      }
    },
  };
}

/**
 * Apply an SPE dose to every living crew member (SDD §4 shelter rule).
 * Returns per-crew delivered doses for tests/UI.
 */
export function applySpeDose(
  world: World,
  pack: ContentPack,
  ids: RadiationSystemIds,
  unshieldedMSv: number,
  causedBy?: number,
): Map<string, number> {
  const shelterSafe = pack.number("spe_shelter_safe");
  const shelterMin = pack.number("spe_shelter_min");
  const crews = world.store<CrewComponent>(CREW_COMPONENT);
  const day = Math.floor(world.tickCount / 24) % 30;
  const delivered = new Map<string, number>();

  for (const [, crew] of crews.entries()) {
    if (crew.alive !== 1) {
      continue;
    }
    const gcm2 = crewShieldingGcm2(world, pack, crew);
    let doseMSv: number;
    if (gcm2 >= shelterSafe) {
      doseMSv = Math.min(10, unshieldedMSv * 0.02);
    } else if (gcm2 <= 0) {
      doseMSv = unshieldedMSv;
    } else {
      // Linear: full dose at 0, half at spe_shelter_min (drops a major SPE
      // under the 30-day limit), down to the ≤10 mSv regime at shelter_safe.
      const factor =
        gcm2 <= shelterMin
          ? 1 - (0.5 * gcm2) / shelterMin
          : 0.5 - (0.4 * (gcm2 - shelterMin)) / (shelterSafe - shelterMin);
      doseMSv = unshieldedMSv * factor;
    }
    crew.dose30d[day] = (crew.dose30d[day] ?? 0) + doseMSv;
    crew.doseCareerMSv += doseMSv;
    delivered.set(crew.name, doseMSv);
  }
  pushAlert(
    world,
    ids.alertsEntity,
    "critical",
    "spe-hit",
    `Solar particle event delivered up to ${unshieldedMSv} mSv to unsheltered crew — review doses in the roster`,
    causedBy,
  );
  return delivered;
}
