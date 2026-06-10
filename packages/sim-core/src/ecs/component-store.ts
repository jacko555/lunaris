import { deepQuantize } from "../quantize.js";
import { compareNumbers } from "../stable-stringify.js";
import type { EntityId, JsonObject } from "../types.js";

/**
 * Typed component store: plain-data components keyed by entity id.
 * All iteration is in ascending entity-id order — the one deterministic
 * order that survives save/load — never raw insertion order.
 */
export class ComponentStore<T extends JsonObject = JsonObject> {
  readonly name: string;
  private readonly data = new Map<EntityId, T>();

  constructor(name: string) {
    this.name = name;
  }

  set(entity: EntityId, value: T): void {
    this.data.set(entity, value);
  }

  get(entity: EntityId): T | undefined {
    return this.data.get(entity);
  }

  /** Like get, but throws — for callers that know the component must exist. */
  require(entity: EntityId): T {
    const value = this.data.get(entity);
    if (value === undefined) {
      throw new Error(`Component '${this.name}' missing on entity ${entity}`);
    }
    return value;
  }

  has(entity: EntityId): boolean {
    return this.data.has(entity);
  }

  remove(entity: EntityId): boolean {
    return this.data.delete(entity);
  }

  get size(): number {
    return this.data.size;
  }

  /** Entity ids in ascending order — the deterministic iteration order. */
  entities(): EntityId[] {
    return [...this.data.keys()].sort(compareNumbers);
  }

  *entries(): IterableIterator<[EntityId, T]> {
    for (const id of this.entities()) {
      yield [id, this.data.get(id) as T];
    }
  }

  /** Quantize all numeric fields in place (tick-end pass, docs/SDD.md §10). */
  quantizeAll(): void {
    for (const value of this.data.values()) {
      deepQuantize(value);
    }
  }

  /** Sorted entries for the save file. */
  serialize(): [EntityId, T][] {
    return [...this.entries()];
  }

  /** Replace contents from a save file. */
  load(entries: [EntityId, T][]): void {
    this.data.clear();
    for (const [id, value] of entries) {
      this.data.set(id, value);
    }
  }

  clear(): void {
    this.data.clear();
  }
}
