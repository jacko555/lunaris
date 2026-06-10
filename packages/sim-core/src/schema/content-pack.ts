import { z } from "zod";
import { compareStrings } from "../stable-stringify.js";
import {
  buildingSchema,
  constantSchema,
  encyclopediaSchema,
  eventSchema,
  mapSchema,
  reactionSchema,
  resourceSchema,
  scenarioSchema,
  techSchema,
  type Building,
  type Constant,
  type EncyclopediaEntry,
  type GameEvent,
  type GameMap,
  type Reaction,
  type Resource,
  type Scenario,
  type Tech,
} from "./items.js";

/**
 * Content-pack loader (docs/DATA-SCHEMA.md, docs/TAD.md §5).
 * Validates each category document, enforces the CI validation rules
 * (mass balance, referential integrity, no tech cycles, unlock phases),
 * and merges mod packs by id with override semantics.
 *
 * Pure: takes parsed JSON values, never touches the filesystem.
 */

export class ContentPackError extends Error {
  readonly issues: string[];

  constructor(packId: string, issues: string[]) {
    super(`Content pack '${packId}' failed validation:\n  - ${issues.join("\n  - ")}`);
    this.name = "ContentPackError";
    this.issues = issues;
  }
}

export interface ContentPackDocuments {
  constants?: unknown;
  resources?: unknown;
  reactions?: unknown;
  buildings?: unknown;
  tech?: unknown;
  events?: unknown;
  maps?: unknown;
  scenarios?: unknown;
  encyclopedia?: unknown;
}

export interface ContentPack {
  id: string;
  constants: Constant[];
  resources: Resource[];
  reactions: Reaction[];
  buildings: Building[];
  tech: Tech[];
  events: GameEvent[];
  maps: GameMap[];
  scenarios: Scenario[];
  encyclopedia: EncyclopediaEntry[];
  /** Lookup by id; throws on a missing id (content refs are pre-validated). */
  constant(id: string): Constant;
  /** Scalar constant value; throws if the constant is composite. */
  number(id: string): number;
  resource(id: string): Resource;
  reaction(id: string): Reaction;
  building(id: string): Building;
  techNode(id: string): Tech;
  event(id: string): GameEvent;
}

type Category = keyof ContentPackDocuments;

const CATEGORY_SCHEMAS: Record<Category, z.ZodTypeAny> = {
  constants: z.array(constantSchema),
  resources: z.array(resourceSchema),
  reactions: z.array(reactionSchema),
  buildings: z.array(buildingSchema),
  tech: z.array(techSchema),
  events: z.array(eventSchema),
  maps: z.array(mapSchema),
  scenarios: z.array(scenarioSchema),
  encyclopedia: z.array(encyclopediaSchema),
};

const CATEGORIES = Object.keys(CATEGORY_SCHEMAS) as Category[];

interface RawPack {
  constants: Constant[];
  resources: Resource[];
  reactions: Reaction[];
  buildings: Building[];
  tech: Tech[];
  events: GameEvent[];
  maps: GameMap[];
  scenarios: Scenario[];
  encyclopedia: EncyclopediaEntry[];
}

export interface LoadOptions {
  /**
   * Mod packs reference base-pack content, so they cannot pass referential
   * cross-validation in isolation. `partial: true` validates item schemas
   * and intra-pack id uniqueness only; mergePacks re-runs the full
   * cross-validation on the merged result.
   */
  partial?: boolean;
}

export function loadContentPack(
  id: string,
  documents: ContentPackDocuments,
  options?: LoadOptions,
): ContentPack {
  const issues: string[] = [];
  const raw = parseDocuments(documents, issues);
  if (issues.length > 0) {
    throw new ContentPackError(id, issues);
  }
  return assemble(id, raw, options?.partial === true);
}

/**
 * Merge mod packs onto a base pack: same id with `override: true` replaces,
 * same id without it is an error, new ids append. The merged pack is fully
 * re-validated (a mod can break referential integrity).
 */
export function mergePacks(base: ContentPack, ...mods: ContentPack[]): ContentPack {
  const issues: string[] = [];
  const merged: RawPack = {
    constants: [...base.constants],
    resources: [...base.resources],
    reactions: [...base.reactions],
    buildings: [...base.buildings],
    tech: [...base.tech],
    events: [...base.events],
    maps: [...base.maps],
    scenarios: [...base.scenarios],
    encyclopedia: [...base.encyclopedia],
  };
  const mergedId = [base.id, ...mods.map((m) => m.id)].join("+");
  for (const mod of mods) {
    for (const category of CATEGORIES) {
      const target = merged[category] as { id: string; override?: boolean }[];
      for (const item of mod[category] as { id: string; override?: boolean }[]) {
        const existing = target.findIndex((t) => t.id === item.id);
        if (existing >= 0) {
          if (item.override === true) {
            target[existing] = item;
          } else {
            issues.push(
              `pack '${mod.id}' redefines ${category} id '${item.id}' without override: true`,
            );
          }
        } else {
          target.push(item);
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new ContentPackError(mergedId, issues);
  }
  return assemble(mergedId, merged);
}

function parseDocuments(documents: ContentPackDocuments, issues: string[]): RawPack {
  const raw: Partial<RawPack> = {};
  for (const category of CATEGORIES) {
    const doc = documents[category];
    if (doc === undefined) {
      raw[category] = [];
      continue;
    }
    const result = CATEGORY_SCHEMAS[category].safeParse(doc);
    if (result.success) {
      raw[category] = result.data as never;
    } else {
      raw[category] = [];
      for (const issue of result.error.issues) {
        issues.push(`${category}${formatPath(issue.path)}: ${issue.message}`);
      }
    }
  }
  return raw as RawPack;
}

function formatPath(path: (string | number)[]): string {
  return path.length === 0 ? "" : `[${path.join(".")}]`;
}

function assemble(id: string, raw: RawPack, partial = false): ContentPack {
  const issues: string[] = [];

  // Global id uniqueness across all categories (DATA-SCHEMA: "globally unique").
  const seen = new Map<string, string>();
  for (const category of CATEGORIES) {
    for (const item of raw[category]) {
      const prior = seen.get(item.id);
      if (prior !== undefined) {
        issues.push(`duplicate id '${item.id}' (${prior} and ${category})`);
      } else {
        seen.set(item.id, category);
      }
    }
  }

  if (!partial) {
    crossValidate(raw, issues);
  }
  if (issues.length > 0) {
    throw new ContentPackError(id, issues);
  }

  // Deterministic content order: sorted by id within each category.
  const byId = (a: { id: string }, b: { id: string }): number => compareStrings(a.id, b.id);
  const sorted: RawPack = {
    constants: [...raw.constants].sort(byId),
    resources: [...raw.resources].sort(byId),
    reactions: [...raw.reactions].sort(byId),
    buildings: [...raw.buildings].sort(byId),
    tech: [...raw.tech].sort(byId),
    events: [...raw.events].sort(byId),
    maps: [...raw.maps].sort(byId),
    scenarios: [...raw.scenarios].sort(byId),
    encyclopedia: [...raw.encyclopedia].sort(byId),
  };

  const index = new Map<string, unknown>();
  for (const category of CATEGORIES) {
    for (const item of sorted[category]) {
      index.set(`${category}:${item.id}`, item);
    }
  }
  const lookup = <T>(category: Category, itemId: string): T => {
    const item = index.get(`${category}:${itemId}`);
    if (item === undefined) {
      throw new Error(`Content pack '${id}' has no ${category} entry '${itemId}'`);
    }
    return item as T;
  };

  return {
    id,
    ...sorted,
    constant: (cid) => lookup<Constant>("constants", cid),
    number: (cid) => {
      const c = lookup<Constant>("constants", cid);
      if (typeof c.value !== "number") {
        throw new Error(`Constant '${cid}' is composite; access its fields explicitly`);
      }
      return c.value;
    },
    resource: (rid) => lookup<Resource>("resources", rid),
    reaction: (rid) => lookup<Reaction>("reactions", rid),
    building: (bid) => lookup<Building>("buildings", bid),
    techNode: (tid) => lookup<Tech>("tech", tid),
    event: (eid) => lookup<GameEvent>("events", eid),
  };
}

/** DATA-SCHEMA validation rules 2 and 5: referential integrity, tech DAG, unlock phases. */
function crossValidate(raw: RawPack, issues: string[]): void {
  const resourceIds = new Set(raw.resources.map((r) => r.id));
  const reactionIds = new Set(raw.reactions.map((r) => r.id));
  const buildingIds = new Set(raw.buildings.map((b) => b.id));
  const techIds = new Set(raw.tech.map((t) => t.id));
  const encyclopediaIds = new Set(raw.encyclopedia.map((e) => e.id));

  const checkEncyclopedia = (kind: string, itemId: string, ref: string | undefined): void => {
    if (ref !== undefined && !encyclopediaIds.has(ref)) {
      issues.push(`${kind} '${itemId}' references missing encyclopedia entry '${ref}'`);
    }
  };

  for (const resource of raw.resources) {
    checkEncyclopedia("resource", resource.id, resource.encyclopedia);
  }

  for (const reaction of raw.reactions) {
    if (!buildingIds.has(reaction.building)) {
      issues.push(`reaction '${reaction.id}' references missing building '${reaction.building}'`);
    }
    for (const entry of [...reaction.inputs, ...reaction.outputs]) {
      if (!resourceIds.has(entry.resource)) {
        issues.push(`reaction '${reaction.id}' references missing resource '${entry.resource}'`);
      }
    }
  }

  for (const building of raw.buildings) {
    for (const rid of building.reactions) {
      if (!reactionIds.has(rid)) {
        issues.push(`building '${building.id}' references missing reaction '${rid}'`);
      }
    }
    if (building.techRequired !== null && !techIds.has(building.techRequired)) {
      issues.push(`building '${building.id}' references missing tech '${building.techRequired}'`);
    }
    for (const entry of [...building.buildCost.imported, ...building.buildCost.local]) {
      if (!resourceIds.has(entry.resource)) {
        issues.push(
          `building '${building.id}' build cost uses missing resource '${entry.resource}'`,
        );
      }
    }
    checkEncyclopedia("building", building.id, building.encyclopedia);
  }

  const techById = new Map(raw.tech.map((t) => [t.id, t]));
  for (const tech of raw.tech) {
    for (const prereq of tech.prereqs) {
      const prereqId = prereq.endsWith("?") ? prereq.slice(0, -1) : prereq;
      if (!techIds.has(prereqId)) {
        issues.push(`tech '${tech.id}' references missing prereq '${prereqId}'`);
      }
    }
    for (const bid of tech.unlocks.buildings) {
      if (!buildingIds.has(bid)) {
        issues.push(`tech '${tech.id}' unlocks missing building '${bid}'`);
      } else {
        const building = raw.buildings.find((b) => b.id === bid) as Building;
        // Rule 5: phase of unlocks ≥ phase of tech.
        if (building.phase < tech.phase) {
          issues.push(
            `tech '${tech.id}' (phase ${tech.phase}) unlocks building '${bid}' ` +
              `of earlier phase ${building.phase}`,
          );
        }
      }
    }
  }

  // Rule 5: no tech cycles. Iterative DFS over hard+optional prereq edges.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (techId: string, trail: string[]): void => {
    if (done.has(techId)) {
      return;
    }
    if (visiting.has(techId)) {
      issues.push(`tech prerequisite cycle: ${[...trail, techId].join(" → ")}`);
      return;
    }
    visiting.add(techId);
    const node = techById.get(techId);
    if (node !== undefined) {
      for (const prereq of node.prereqs) {
        const prereqId = prereq.endsWith("?") ? prereq.slice(0, -1) : prereq;
        if (techIds.has(prereqId)) {
          visit(prereqId, [...trail, techId]);
        }
      }
    }
    visiting.delete(techId);
    done.add(techId);
  };
  for (const tech of raw.tech) {
    visit(tech.id, []);
  }

  for (const event of raw.events) {
    checkEncyclopedia("event", event.id, event.encyclopedia);
    if (event.warningTicks !== undefined && event.warningTicks[0] > event.warningTicks[1]) {
      issues.push(`event '${event.id}' warningTicks range is inverted`);
    }
  }
}
