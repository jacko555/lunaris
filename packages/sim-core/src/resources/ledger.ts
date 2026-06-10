import type { ComponentStore } from "../ecs/component-store.js";
import { compareStrings } from "../stable-stringify.js";
import type { EntityId } from "../types.js";

/**
 * Resource mass ledger (CLAUDE.md hard rule 3): no system may create or
 * destroy resource mass without a declared source or sink. All mutation of
 * resource amounts flows through add/remove/transfer; at tick end the world
 * verifies that the net change in total stored mass equals declared
 * sources minus declared sinks, and throws otherwise. The property tests in
 * tests/invariants exercise this exhaustively.
 */

/** Per-entity resource amounts in kg. Zero entries are deleted so state stays canonical. */
export type ResourceStoreData = {
  amounts: Record<string, number>;
};

/** Allowed slack per tick, matching the reaction mass-balance rule (docs/DATA-SCHEMA.md). */
export const CONSERVATION_TOLERANCE_KG = 1e-6;

export class ConservationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConservationError";
  }
}

export interface LedgerReport {
  tick: number;
  createdKg: Record<string, number>;
  destroyedKg: Record<string, number>;
  netDeltaKg: number;
}

export class ResourceLedger {
  private readonly store: ComponentStore<ResourceStoreData>;
  private created = new Map<string, number>();
  private destroyed = new Map<string, number>();
  private totalAtTickStartKg = 0;

  constructor(store: ComponentStore<ResourceStoreData>) {
    this.store = store;
  }

  amount(entity: EntityId, resource: string): number {
    return this.store.get(entity)?.amounts[resource] ?? 0;
  }

  /** Total stored mass of one resource across all entities. */
  totalOf(resource: string): number {
    let total = 0;
    for (const [, data] of this.store.entries()) {
      total += data.amounts[resource] ?? 0;
    }
    return total;
  }

  /** Total stored mass of all resources (deterministic summation order). */
  totalKg(): number {
    let total = 0;
    for (const [, data] of this.store.entries()) {
      for (const resource of Object.keys(data.amounts).sort(compareStrings)) {
        total += data.amounts[resource] as number;
      }
    }
    return total;
  }

  /** Create mass into an entity's store, attributed to a declared source. */
  add(entity: EntityId, resource: string, kg: number, source: string): void {
    this.validateFlow(kg, source, "source");
    this.deposit(entity, resource, kg);
    this.created.set(source, (this.created.get(source) ?? 0) + kg);
  }

  /** Destroy mass from an entity's store, attributed to a declared sink. */
  remove(entity: EntityId, resource: string, kg: number, sink: string): void {
    this.validateFlow(kg, sink, "sink");
    this.withdraw(entity, resource, kg);
    this.destroyed.set(sink, (this.destroyed.get(sink) ?? 0) + kg);
  }

  /** Destroy up to `kg`, returning what was actually removed. */
  removeUpTo(entity: EntityId, resource: string, kg: number, sink: string): number {
    const available = this.amount(entity, resource);
    const taken = Math.min(kg, available);
    if (taken > 0) {
      this.remove(entity, resource, taken, sink);
    }
    return taken;
  }

  /** Conservative move between entities — needs no source/sink declaration. */
  transfer(from: EntityId, to: EntityId, resource: string, kg: number): void {
    if (!(kg >= 0) || !Number.isFinite(kg)) {
      throw new ConservationError(`transfer of invalid mass ${kg} kg of '${resource}'`);
    }
    this.withdraw(from, resource, kg);
    this.deposit(to, resource, kg);
  }

  /** Sink all resources held by an entity (e.g. on entity destruction). */
  clearEntity(entity: EntityId, sink: string): void {
    const data = this.store.get(entity);
    if (data === undefined) {
      return;
    }
    for (const resource of Object.keys(data.amounts).sort(compareStrings)) {
      this.remove(entity, resource, data.amounts[resource] as number, sink);
    }
    this.store.remove(entity);
  }

  /** Snapshot total mass and reset flow accumulators (called by world at tick start). */
  beginTick(): void {
    this.created.clear();
    this.destroyed.clear();
    this.totalAtTickStartKg = this.totalKg();
  }

  /**
   * Verify conservation for the tick that just ran and return its report.
   * Throws ConservationError if stored mass changed by more than declared
   * sources minus sinks (within tolerance) — e.g. a system mutated a
   * resource store directly instead of going through the ledger.
   */
  endTick(tick: number): LedgerReport {
    const netDeltaKg = this.totalKg() - this.totalAtTickStartKg;
    let declaredKg = 0;
    for (const kg of this.created.values()) {
      declaredKg += kg;
    }
    for (const kg of this.destroyed.values()) {
      declaredKg -= kg;
    }
    const discrepancyKg = Math.abs(netDeltaKg - declaredKg);
    if (discrepancyKg > CONSERVATION_TOLERANCE_KG) {
      throw new ConservationError(
        `Mass conservation violated at tick ${tick}: stored mass changed by ` +
          `${netDeltaKg} kg but declared sources−sinks total ${declaredKg} kg ` +
          `(discrepancy ${discrepancyKg} kg). Some code mutated resource ` +
          `amounts without a declared source/sink.`,
      );
    }
    return {
      tick,
      createdKg: this.flowRecord(this.created),
      destroyedKg: this.flowRecord(this.destroyed),
      netDeltaKg,
    };
  }

  private flowRecord(flows: Map<string, number>): Record<string, number> {
    const record: Record<string, number> = {};
    for (const tag of [...flows.keys()].sort(compareStrings)) {
      record[tag] = flows.get(tag) as number;
    }
    return record;
  }

  private validateFlow(kg: number, tag: string, kind: "source" | "sink"): void {
    if (!(kg >= 0) || !Number.isFinite(kg)) {
      throw new ConservationError(`declared ${kind} '${tag}' with invalid mass ${kg} kg`);
    }
    if (tag.trim() === "") {
      throw new ConservationError(`resource flow requires a non-empty ${kind} tag`);
    }
  }

  private deposit(entity: EntityId, resource: string, kg: number): void {
    let data = this.store.get(entity);
    if (data === undefined) {
      data = { amounts: {} };
      this.store.set(entity, data);
    }
    data.amounts[resource] = (data.amounts[resource] ?? 0) + kg;
  }

  private withdraw(entity: EntityId, resource: string, kg: number): void {
    const data = this.store.get(entity);
    const available = data?.amounts[resource] ?? 0;
    if (kg > available + CONSERVATION_TOLERANCE_KG) {
      throw new ConservationError(
        `entity ${entity} holds ${available} kg of '${resource}', cannot withdraw ${kg} kg`,
      );
    }
    if (data !== undefined) {
      const remaining = Math.max(0, available - kg);
      if (remaining === 0) {
        // Zero entries are deleted so "never held" and "held then emptied"
        // hash identically.
        delete data.amounts[resource];
      } else {
        data.amounts[resource] = remaining;
      }
    }
  }
}
