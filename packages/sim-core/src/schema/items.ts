import { z } from "zod";
import {
  asOfSchema,
  idSchema,
  jsonValueSchema,
  massEntrySchema,
  phaseSchema,
  prereqSchema,
  statusSchema,
} from "./common.js";

/**
 * Item schemas mirroring docs/DATA-SCHEMA.md, one per content category.
 * All schemas are strict: unknown keys are validation errors (typos in
 * content JSON must not pass silently). `override: true` marks an item in a
 * mod pack that intentionally replaces a same-id item from an earlier pack.
 */

const overrideField = { override: z.boolean().optional() };

// ── Constant ──

export const constantSchema = z
  .object({
    id: idSchema,
    value: z.union([z.number(), z.record(z.string(), z.number())]),
    unit: z.string().min(1),
    range: z.tuple([z.number(), z.number()]).optional(),
    source: z.string(),
    as_of: asOfSchema,
    status: statusSchema.default("sourced"),
    notes: z.string().optional(),
    ...overrideField,
  })
  .strict()
  .superRefine((c, ctx) => {
    // DATA-SCHEMA validation rule 3: sourced values need a non-empty source.
    if (c.status === "sourced" && c.source.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `constant '${c.id}' has status 'sourced' but an empty source`,
      });
    }
    if (c.range !== undefined && c.range[0] > c.range[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `constant '${c.id}' range is inverted`,
      });
    }
  });

export type Constant = z.infer<typeof constantSchema>;

// ── Resource ──

export const resourceSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    phase: phaseSchema,
    storageClass: z.enum(["pressurized", "cryogenic", "bulk", "ambient"]),
    /** Drawn freely from the ground at the consuming building (regolith). */
    groundSourced: z.boolean().default(false),
    densityKgM3: z.number().positive(),
    boiloffPerDay: z.number().min(0).max(1).default(0),
    importCostPerKg: z.number().min(0).nullable(),
    encyclopedia: idSchema.optional(),
    source: z.string().min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict();

export type Resource = z.infer<typeof resourceSchema>;

// ── Reaction ──

/** Reaction mass balance must close to within ±1e-6 kg (DATA-SCHEMA rule 1). */
export const REACTION_MASS_TOLERANCE_KG = 1e-6;

export const reactionSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    building: idSchema,
    inputs: z.array(massEntrySchema).min(1),
    outputs: z.array(massEntrySchema).min(1),
    ventedLossKg: z.number().min(0).default(0),
    energyKwhPerKgPrimary: z.number().min(0),
    primaryOutput: idSchema,
    heatKw: z.number(),
    minTempK: z.number().positive().optional(),
    source: z.string().min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict()
  .superRefine((r, ctx) => {
    const inKg = r.inputs.reduce((sum, e) => sum + e.kg, 0);
    const outKg = r.outputs.reduce((sum, e) => sum + e.kg, 0) + r.ventedLossKg;
    if (Math.abs(inKg - outKg) > REACTION_MASS_TOLERANCE_KG) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `reaction '${r.id}' violates mass balance: inputs ${inKg} kg vs ` +
          `outputs+vented ${outKg} kg`,
      });
    }
    if (!r.outputs.some((e) => e.resource === r.primaryOutput)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `reaction '${r.id}' primaryOutput '${r.primaryOutput}' is not among its outputs`,
      });
    }
  });

export type Reaction = z.infer<typeof reactionSchema>;

// ── Building ──

export const buildingSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    tier: z.number().int().min(0),
    phase: phaseSchema,
    analogue: z.string().min(1),
    source: z.string().min(1),
    as_of: asOfSchema,
    massKg: z.number().positive(),
    footprint: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    keepoutRadius: z.number().int().min(0).default(0),
    powerKw: z.number(), // + produces, − consumes
    /** Production scales with tile illumination (solar arrays). */
    powerScalesWithIllumination: z.boolean().default(false),
    /** Energy storage capacity (battery banks, regenerative fuel cells). */
    storageKwh: z.number().positive().optional(),
    /** Round-trip efficiency applied when charging storage (SDD §3). */
    storageRoundTripEff: z.number().gt(0).max(1).optional(),
    heatKw: z.number(),
    radiatorKw: z.number().min(0).default(0),
    /** Rejection serves the whole base (radiator wings) instead of only this building. */
    radiatorShared: z.boolean().default(false),
    crewOps: z.record(z.string(), z.number().min(0)).default({}),
    /**
     * Crew-facing capacities: housing (long-term berths, crowding),
     * shelter (SPE refuge seats), exercise (countermeasure slots/day),
     * medical (clinic patients).
     */
    services: z
      .record(z.enum(["housing", "shelter", "exercise", "medical"]), z.number().positive())
      .default({}),
    /** Life-support equipment rates (ECLSS core). */
    eclss: z
      .object({
        scrubberKgCo2Day: z.number().min(0).default(0),
        ogaKgO2Day: z.number().min(0).default(0),
        waterRecovery: z.number().min(0).max(1).default(0),
        waterKgDay: z.number().min(0).default(0),
      })
      .strict()
      .optional(),
    shieldingGcm2: z.number().min(0).default(0),
    // DATA-SCHEMA rule 4: tiers 0–3, tier 0 reserved for life-support class.
    priorityTier: z.number().int().min(0).max(3).nullable(),
    wearRatePerYear: z.number().min(0).max(1).default(0),
    lifeYears: z.number().positive().optional(),
    buildCost: z
      .object({
        imported: z.array(massEntrySchema).default([]),
        local: z.array(massEntrySchema).default([]),
      })
      .strict(),
    placement: z
      .object({
        terrain: z.array(z.enum(["highland", "mare"])).min(1),
        maxSlope: z.number().min(0),
        requiresPSR: z.boolean().default(false),
      })
      .strict(),
    reactions: z.array(idSchema).default([]),
    /** Primary-output throughput per hosted reaction (kg of primaryOutput/day). */
    reactionKgPerDay: z.record(idSchema, z.number().positive()).default({}),
    /**
     * Excavates the building's own tile: yields water-ice × tile iceFrac
     * plus regolith × (1 − iceFrac) — "ice mining yield = tile ice
     * concentration" (TASKS.md M4). Energy is included in powerKw.
     */
    mining: z
      .object({
        kgPerDay: z.number().positive(),
        energyKwhPerKg: z.number().min(0),
      })
      .strict()
      .optional(),
    /** Research output (labs/observatories), points per day at full duty. */
    sciencePerDay: z.number().min(0).default(0),
    /** Output degrades with dust accumulation (solar arrays). */
    dustSensitive: z.boolean().default(false),
    /** Grants its shieldingGcm2 to adjacent buildings (regolith berms). */
    shieldingAura: z.boolean().default(false),
    /** Damps landing-dust spikes colony-wide when present (landing pads). */
    landingPad: z.boolean().default(false),
    /** Sells LOX to visiting missions when powered (Phase-3 revenue hook). */
    propellantDepot: z.boolean().default(false),
    /** Satisfies the Phase-0 comms-relay criterion (comms towers/relays). */
    commsRelay: z.boolean().default(false),
    techRequired: idSchema.nullable(),
    encyclopedia: idSchema.optional(),
    ...overrideField,
  })
  .strict();

export type Building = z.infer<typeof buildingSchema>;

// ── Tech ──

export const techSchema = z
  .object({
    id: idSchema,
    branch: z.string().min(1),
    phase: phaseSchema,
    trl2026: z.number().int().min(1).max(9),
    costScience: z.number().positive(),
    prereqs: z.array(prereqSchema).default([]),
    unlocks: z
      .object({
        buildings: z.array(idSchema).default([]),
        modifiers: z.array(jsonValueSchema).default([]),
      })
      .strict(),
    setbackRisk: z.number().min(0).max(1).optional(),
    source: z.string().min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict();

export type Tech = z.infer<typeof techSchema>;

// ── Event ──

export const eventSchema = z
  .object({
    id: idSchema,
    category: z.string().min(1),
    rates: z
      .object({
        ideal: z.number().min(0),
        realistic: z.number().min(0),
      })
      .strict(),
    warningTicks: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
    conditions: z.record(z.string(), jsonValueSchema).default({}),
    // Effect taxonomy firms up with the hazard engine (M4); until then any
    // typed object passes and unknown keys are carried through.
    effects: z.array(z.object({ type: z.string().min(1) }).passthrough()).min(1),
    responses: z.array(idSchema).default([]),
    alertTemplate: z.string().optional(),
    encyclopedia: idSchema.optional(),
    source: z.string().min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict();

export type GameEvent = z.infer<typeof eventSchema>;

// ── Map ──

export const mapSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    size: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
    tiles: z.string(), // RLE-base64; decoded by the map loader (M2)
    iceUncertainty: z.boolean().default(false),
    lavaTubes: z
      .array(
        z
          .object({
            pos: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
            capacity: z.number().positive(),
          })
          .strict(),
      )
      .default([]),
    source: z.string().min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict();

export type GameMap = z.infer<typeof mapSchema>;

// ── Scenario (docs/MODES.md §2.1 + DATA-SCHEMA additions) ──

export const scenarioSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    agency: z.enum(["nasa", "ilrs", "commercial", "custom"]),
    startYear: z.number().int(),
    horizonYears: z.number().positive(),
    budgetProfile: z
      .object({
        annualUSD: z.number().min(0),
        volatility: z.string().min(1),
      })
      .strict(),
    launchCadence: z
      .object({
        roboticPerYear: z.number().min(0),
        crewPerYear: z.number().min(0),
      })
      .strict(),
    startTechs: z.array(idSchema).default([]),
    failureTables: z.enum(["ideal", "realistic", "custom"]),
    failureOverrides: z.record(idSchema, z.number().min(0)).default({}),
    site: idSchema,
    policyAI: z.string().min(1),
    policyWeights: z.record(z.string(), z.number()).optional(),
    autopause: z.array(z.string()).default([]),
    seed: z.number().int().nullable(),
    ...overrideField,
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;

// ── Encyclopedia entry ──

export const encyclopediaSchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    realWorld: z.string().optional(),
    sources: z.array(z.string().min(1)).min(1),
    as_of: asOfSchema,
    ...overrideField,
  })
  .strict();

export type EncyclopediaEntry = z.infer<typeof encyclopediaSchema>;
