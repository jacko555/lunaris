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
  /** 0–1; thermal damage and wear erode it, 0 = inoperative. */
  condition: number;
  /** Fraction of demanded power received last power pass (producers: 1). */
  poweredFraction: number;
  /** Tick until which the building is forced offline (fission scram etc.). */
  offlineUntilTick: number;
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

/** Scheduled Earth mission (logistics v1: vehicle classes, transit, failure). */
export type ResupplyComponent = {
  /** "cargo" | "probe" | "sortie" */
  kind: string;
  vehicle: string; // vehicle class id (clps | mid | heavy | starship)
  manifest: { resource: string; kg: number }[];
  arrivalTick: number;
  /** 0 = one-shot; otherwise reschedules every N ticks after delivery. */
  repeatTicks: number;
  /** Building entity that receives the cargo (cargo kind). */
  targetEntity: number;
  /** Probe target tile (probe kind). */
  targetX: number;
  targetY: number;
  costUsd: number;
  deliveries: number;
  failures: number;
};

export const SITE_COMPONENT = "construction-site";
export const DUST_COMPONENT = "dust";
export const STATS_COMPONENT = "stats";
export const RESEARCH_COMPONENT = "research";
export const ECONOMY_COMPONENT = "economy";
export const PHASE_COMPONENT = "phase";
export const PENDING_HAZARD_COMPONENT = "pending-hazard";

/** A queued build in progress (TASKS.md M4 construction system). */
export type SiteComponent = {
  defId: string;
  x: number;
  y: number;
  progressHours: number;
  totalHours: number;
  /** "imported" | "local" — which buildCost recipe was paid. */
  recipe: string;
  /** 1 once materials are consumed; sites wait (alerting) until affordable. */
  paid: number;
};

/** Dust accumulation on a dust-sensitive building (solar arrays). */
export type DustComponent = {
  frac: number; // 0–1 output degradation
};

/** Colony flow statistics (rolling per lunar cycle + cumulative). */
export type StatsComponent = {
  /** Current-cycle local vs imported production of O₂ + water (kg). */
  cycleLocalKg: number;
  cycleImportedKg: number;
  /** Last completed cycle's local share of O₂+water production (0–1). */
  lastCycleLocalShare: number;
  cumulativeLocalKg: number;
  cumulativeImportedKg: number;
  /** 1 once the ≥50% local O₂+water milestone has been hit (v0.1 MVP goal). */
  isru50Milestone: number;
  /** Mass-closure across ALL imports vs local creation (SDD §6 closure%). */
  cycleAllLocalKg: number;
  cycleAllImportedKg: number;
  lastCycleClosure: number;
};

/** Research state (TECH-TREE.md). */
export type ResearchComponent = {
  sciencePoints: number;
  unlocked: string[];
  current: string; // tech id or "" when idle
  progress: number;
  /** 1 after a Realistic-mode setback already hit the current project. */
  setbackApplied: number;
};

/** Budget & cashflow (ECONOMY.md §4). */
export type EconomyComponent = {
  balanceUsd: number;
  annualBudgetUsd: number;
  totalLaunchSpendUsd: number;
  totalOpsSpendUsd: number;
  totalRevenueUsd: number;
};

/** Phase progression flags (PHASES.md). */
export type PhaseComponent = {
  phase: number;
  successfulLandings: number;
  iceCharacterized: number;
  commsActive: number;
  sortiesCompleted: number;
  /** Consecutive ticks with living crew on the surface. */
  occupationTicks: number;
  /** 1 after crew survived a full lunar night on the surface. */
  nightSurvived: number;
  /** Ticks of night endured so far with crew alive (resets at dawn/death). */
  nightTicksWithCrew: number;
  isruDemo: number;
  /** Tick at which the current phase was entered (export-economy timing). */
  phaseEnteredTick: number;
  /** Timestamped milestone log — the observer-mode timeline. */
  milestones: { tick: number; id: string }[];
};

export const POLICY_COMPONENT = "policy";
export const RIVAL_COMPONENT = "rival";

/** Policy AI state (MODES.md §2.2) — the simulation-mode decision maker. */
export type PolicyComponent = {
  enabled: number; // 0 = manual (game mode), 1 = AI plays
  /** Growth-pass weights: infrastructure / isru / science / population. */
  weights: Record<string, number>;
  /** Site anchor for AI construction (chosen at scenario start). */
  baseX: number;
  baseY: number;
  mineX: number;
  mineY: number;
  /** Throttles so daily passes don't spam commands. */
  lastResupplyTick: number;
  lastCrewTick: number;
};

/** Rival-program ticker (international competition flavor). */
export type RivalComponent = {
  name: string;
  /** Remaining scheduled milestones, [tick, label] sorted ascending. */
  upcoming: { tick: number; label: string }[];
};

/** A hazard rolled by the engine, waiting out its warning lead time. */
export type PendingHazardComponent = {
  eventId: string;
  impactTick: number;
};
