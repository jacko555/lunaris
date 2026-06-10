import { z } from "zod";

/**
 * Shared schema fragments for content packs (docs/DATA-SCHEMA.md).
 *
 * Note on id casing: DATA-SCHEMA.md headline says kebab-case, but its own
 * Constant example and the SDD constants table use snake_case. Both are
 * accepted: convention is snake_case for constants (matching SDD ids),
 * kebab-case for everything else. Ids are globally unique across all
 * content categories in a pack.
 */
export const ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export const idSchema = z.string().regex(ID_PATTERN, "ids are lower-case kebab/snake-case");

/** Tech prerequisite: an id, optionally suffixed '?' for optional synergy. */
export const prereqSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*\??$/, "prereq is an id with optional trailing '?'");

export const asOfSchema = z.string().regex(/^\d{4}-\d{2}$/, "as_of is YYYY-MM");

export const statusSchema = z.enum(["sourced", "needs_source", "speculative"]);

export const phaseSchema = z.number().int().min(0).max(6);

/** {resource, kg} pair used by reactions and build costs. */
export const massEntrySchema = z
  .object({
    resource: idSchema,
    kg: z.number().positive(),
  })
  .strict();

export type MassEntry = z.infer<typeof massEntrySchema>;

/** Recursive JSON value (for loosely-specified fields like tech modifiers). */
export const jsonValueSchema: z.ZodType<import("../types.js").JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
