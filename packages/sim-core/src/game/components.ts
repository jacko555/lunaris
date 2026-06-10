/**
 * Component shapes for the game world (plain data, type aliases so they
 * stay assignable to JsonObject). Singletons (environment, grid, alerts)
 * live on fixed entities created by the game def in setup order.
 */

export const ENVIRONMENT_COMPONENT = "environment";
export const GRID_COMPONENT = "grid";
export const ALERTS_COMPONENT = "alerts";
export const BUILDING_COMPONENT = "building";
export const THERMAL_COMPONENT = "thermal";
export const STORAGE_COMPONENT = "storage";

/** Lunar clock and site conditions for the current tick (SDD §2). */
export type EnvironmentComponent = {
  /** 0–1 through the 29.53-day synodic cycle; 0 = dawn for class-B tiles. */
  lunarPhase: number;
  tempSurfaceK: number;
  tempPsrK: number;
  /** Illumination by tile class this tick (0 or 1). */
  litA: number;
  litB: number;
  litC: number;
  /** Convenience flag: 1 during the class-B night half of the cycle. */
  isNight: number;
};

/** Power-grid bookkeeping for the current tick (SDD §3). */
export type GridComponent = {
  generationKw: number;
  demandKw: number;
  suppliedKw: number;
  unmetKw: number;
  chargeKw: number;
  dischargeKw: number;
  curtailedKw: number;
  storedKwh: number;
  storageCapacityKwh: number;
  /** Demand and supplied fraction per priority tier 0–3. */
  tierDemandKw: number[];
  tierFraction: number[];
  /** 1 while any tier is shed (drives brownout alert edges). */
  brownout: number;
};

export type AlertEntry = {
  tick: number;
  seq: number;
  severity: string; // "info" | "warning" | "critical"
  code: string;
  message: string;
};

export type AlertsComponent = {
  entries: AlertEntry[];
  seq: number;
};

export type BuildingComponent = {
  defId: string;
  x: number;
  y: number;
  /** 0–1; thermal damage erodes it, 0 = inoperative. */
  condition: number;
  /** Fraction of demanded power received last power pass (producers: 1). */
  poweredFraction: number;
};

export type ThermalComponent = {
  tempK: number;
  state: string; // "nominal" | "overheat" | "freeze"
  /** Tier-1 heater power requested for next tick (SDD §5 night heating). */
  heaterRequestKw: number;
  heaterDeliveredKw: number;
};

export type StorageComponent = {
  energyKwh: number;
};

export const CREW_COMPONENT = "crew";
export const RESUPPLY_COMPONENT = "resupply";

/** Crew member (docs/SDD.md §9; save shape per docs/DATA-SCHEMA.md §Crew). */
export type CrewComponent = {
  name: string;
  skills: Record<string, number>;
  health: number; // 0–100
  morale: number; // 0–100
  doseCareerMSv: number;
  /** Rolling 30 daily mSv buckets indexed by absolute day mod 30. */
  dose30d: number[];
  /** Building entity the crew member occupies. */
  location: number;
  /** 1 while on EVA: unshielded dose, location shielding ignored. */
  eva: number;
  alive: number; // 1 alive, 0 dead (kept for the roster/story)
  /** Consecutive shortage hours — drive the legible failure cascades. */
  hungerHours: number;
  thirstHours: number;
  hypoxiaHours: number;
  co2Hours: number;
  /** 1 while rolling-30-day dose exceeds the NASA limit. */
  radiationSick: number;
};

/** Scheduled Earth cargo mission (logistics v0 — no failure rolls until M4/M5). */
export type ResupplyComponent = {
  manifest: { resource: string; kg: number }[];
  arrivalTick: number;
  /** 0 = one-shot; otherwise reschedules every N ticks after delivery. */
  repeatTicks: number;
  /** Building entity that receives the cargo. */
  targetEntity: number;
  costUsd: number;
  deliveries: number;
};
