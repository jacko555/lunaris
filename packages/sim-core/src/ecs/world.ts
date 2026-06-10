import { hashValue } from "../hash.js";
import { ResourceLedger, type LedgerReport, type ResourceStoreData } from "../resources/ledger.js";
import { Rng } from "../rng.js";
import { compareStrings, stableStringify } from "../stable-stringify.js";
import type { EntityId, JsonObject, JsonValue } from "../types.js";
import { CommandQueue, type CommandQueueState, type QueuedCommand } from "./commands.js";
import { ComponentStore } from "./component-store.js";

/**
 * Systems are pure tick functions over the world (CLAUDE.md conventions):
 * `(world, dtHours) => void`, mutating only via component stores and the
 * resource ledger, drawing randomness only from world.rng, and running in
 * fixed registration order (docs/TAD.md §3).
 */
export interface System {
  name: string;
  update: (world: World, dtHours: number) => void;
}

export type CommandHandler = (world: World, payload: JsonValue) => void;

export interface WorldOptions {
  seed: number;
  /** Opaque scenario config, carried through saves verbatim. */
  config?: JsonValue;
}

/** Name of the built-in component store backing the resource ledger. */
export const RESOURCE_STORE = "resources";

/** Sink tag used when an entity is destroyed while still holding resources. */
export const ENTITY_DESTROYED_SINK = "entity-destroyed";

export class World {
  readonly seed: number;
  readonly config: JsonValue;
  readonly rng: Rng;
  readonly resources: ResourceLedger;

  /** Completed tick count == index of the next tick to execute. 1 tick = 1 game-hour. */
  tickCount = 0;

  private nextEntityId = 1;
  private readonly stores = new Map<string, ComponentStore<JsonObject>>();
  private readonly systems: System[] = [];
  private readonly commandHandlers = new Map<string, CommandHandler>();
  private readonly queue = new CommandQueue();
  private lastReport: LedgerReport | null = null;

  constructor(options: WorldOptions) {
    this.seed = options.seed;
    this.config = options.config ?? null;
    if (this.config !== null) {
      stableStringify(this.config); // must survive saves verbatim
    }
    this.rng = new Rng(options.seed);
    const resourceStore = this.registerComponent<ResourceStoreData>(RESOURCE_STORE);
    this.resources = new ResourceLedger(resourceStore);
  }

  // ── registration (must be identical and in identical order across create/load) ──

  registerComponent<T extends JsonObject>(name: string): ComponentStore<T> {
    if (this.stores.has(name)) {
      throw new Error(`Component store '${name}' already registered`);
    }
    const store = new ComponentStore<T>(name);
    this.stores.set(name, store as ComponentStore<JsonObject>);
    return store;
  }

  store<T extends JsonObject>(name: string): ComponentStore<T> {
    const store = this.stores.get(name);
    if (store === undefined) {
      throw new Error(`Component store '${name}' is not registered`);
    }
    return store as ComponentStore<T>;
  }

  registerSystem(system: System): void {
    if (this.systems.some((s) => s.name === system.name)) {
      throw new Error(`System '${system.name}' already registered`);
    }
    this.systems.push(system);
  }

  systemOrder(): string[] {
    return this.systems.map((s) => s.name);
  }

  registerCommandHandler(type: string, handler: CommandHandler): void {
    if (this.commandHandlers.has(type)) {
      throw new Error(`Command handler '${type}' already registered`);
    }
    this.commandHandlers.set(type, handler);
  }

  // ── entities ──

  createEntity(): EntityId {
    return this.nextEntityId++;
  }

  destroyEntity(entity: EntityId): void {
    this.resources.clearEntity(entity, ENTITY_DESTROYED_SINK);
    for (const store of this.stores.values()) {
      store.remove(entity);
    }
  }

  // ── commands ──

  /**
   * Queue a command for execution at the start of `atTick` (default: the
   * next tick to run). Payload must be JSON-serializable; type must have a
   * registered handler; scheduling into the past is an error.
   */
  enqueueCommand(type: string, payload: JsonValue, atTick: number = this.tickCount): QueuedCommand {
    if (!this.commandHandlers.has(type)) {
      throw new Error(`No handler registered for command '${type}'`);
    }
    if (atTick < this.tickCount) {
      throw new Error(
        `Cannot schedule command '${type}' at past tick ${atTick} (current ${this.tickCount})`,
      );
    }
    return this.queue.enqueue(type, payload, atTick);
  }

  /** Full command log since world creation (the replay input log). */
  commandLog(): readonly QueuedCommand[] {
    return this.queue.getLog();
  }

  // ── tick loop ──

  /** Advance one fixed timestep (1 game-hour). */
  tick(): void {
    this.resources.beginTick();
    for (const cmd of this.queue.takeDue(this.tickCount)) {
      const handler = this.commandHandlers.get(cmd.type) as CommandHandler;
      handler(this, cmd.payload);
    }
    for (const system of this.systems) {
      system.update(this, 1);
    }
    // Conservation check BEFORE quantization: quantization may shift totals
    // by ≤ quantum per entry, the check must see the un-rounded books.
    this.lastReport = this.resources.endTick(this.tickCount);
    for (const store of this.stores.values()) {
      store.quantizeAll();
    }
    this.tickCount++;
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      this.tick();
    }
  }

  /** Ledger report of the most recently completed tick. */
  ledgerReport(): LedgerReport | null {
    return this.lastReport;
  }

  // ── state snapshot / hash ──

  /** Canonical world hash (docs/TAD.md §4) over quantized state. */
  hash(): string {
    return hashValue(this.snapshot());
  }

  /** Canonical JSON snapshot of all simulation state. */
  snapshot(): JsonObject {
    const components: JsonObject = {};
    for (const name of [...this.stores.keys()].sort(compareStrings)) {
      const store = this.stores.get(name) as ComponentStore<JsonObject>;
      components[name] = store.serialize() as unknown as JsonValue;
    }
    return {
      tick: this.tickCount,
      rngState: this.rng.getState(),
      nextEntityId: this.nextEntityId,
      components,
    };
  }

  // ── save/load plumbing (public surface lives in save.ts) ──

  serializeQueue(includeLog: boolean): CommandQueueState {
    return this.queue.serialize(includeLog);
  }

  restoreState(state: {
    tick: number;
    rngState: number;
    nextEntityId: number;
    components: Record<string, [EntityId, JsonObject][]>;
    queue: CommandQueueState;
  }): void {
    const saved = Object.keys(state.components).sort(compareStrings);
    for (const name of saved) {
      if (!this.stores.has(name)) {
        throw new Error(
          `Save contains unknown component store '${name}' — world definition mismatch`,
        );
      }
    }
    for (const [name, store] of this.stores) {
      store.load(state.components[name] ?? []);
    }
    this.tickCount = state.tick;
    this.rng.setState(state.rngState);
    this.nextEntityId = state.nextEntityId;
    this.queue.restore(state.queue);
    this.lastReport = null;
  }
}
