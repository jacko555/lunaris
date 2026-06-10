import type { CommandQueueState, QueuedCommand } from "./ecs/commands.js";
import { World, type WorldOptions } from "./ecs/world.js";
import type { EntityId, JsonObject, JsonValue } from "./types.js";

/**
 * Versioned save format (docs/TAD.md §6):
 * `{version, seed, tick, config, world: components, commandLog?}`.
 * Loading runs the same WorldDef.setup as creation, then restores state;
 * the loaded world hashes identically to the saved one (golden-tested).
 * Migrations are pure functions vN→vN+1 chained at load (none yet at v1).
 */

export const SAVE_FORMAT = "lunaris-save";
export const SAVE_VERSION = 1;

/**
 * A world definition registers components, systems, and command handlers.
 * It must be deterministic and identical between createWorld and loadWorld —
 * registration order is part of the determinism contract.
 */
export interface WorldDef {
  setup(world: World): void;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  seed: number;
  config: JsonValue;
  tick: number;
  rngState: number;
  nextEntityId: number;
  components: Record<string, [EntityId, JsonObject][]>;
  pendingCommands: QueuedCommand[];
  nextCommandSeq: number;
  commandLog?: QueuedCommand[];
}

export function createWorld(def: WorldDef, options: WorldOptions): World {
  const world = new World(options);
  def.setup(world);
  return world;
}

export function saveWorld(world: World, options?: { includeLog?: boolean }): SaveFile {
  const includeLog = options?.includeLog ?? true;
  const snapshot = world.snapshot();
  const queue = world.serializeQueue(includeLog);
  const save: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    seed: world.seed,
    config: world.config,
    tick: snapshot["tick"] as number,
    rngState: snapshot["rngState"] as number,
    nextEntityId: snapshot["nextEntityId"] as number,
    components: snapshot["components"] as unknown as Record<string, [EntityId, JsonObject][]>,
    pendingCommands: queue.pending,
    nextCommandSeq: queue.nextSeq,
  };
  if (includeLog) {
    save.commandLog = queue.log;
  }
  // Detach from live world state: a save must not mutate as ticking continues.
  return JSON.parse(JSON.stringify(save)) as SaveFile;
}

export function loadWorld(def: WorldDef, save: SaveFile): World {
  if (save.format !== SAVE_FORMAT) {
    throw new Error(`Not a LUNARIS save (format '${String(save.format)}')`);
  }
  if (save.version !== SAVE_VERSION) {
    // Future: chain pure migration functions vN→vN+1 here.
    throw new Error(`Unsupported save version ${save.version} (this build reads v${SAVE_VERSION})`);
  }
  // Detach from the caller's save object so neither side can mutate the other.
  const snapshot = JSON.parse(JSON.stringify(save)) as SaveFile;
  const world = new World({ seed: snapshot.seed, config: snapshot.config });
  def.setup(world);
  const queue: CommandQueueState = {
    pending: snapshot.pendingCommands,
    log: snapshot.commandLog ?? [],
    nextSeq: snapshot.nextCommandSeq,
  };
  world.restoreState({
    tick: snapshot.tick,
    rngState: snapshot.rngState,
    nextEntityId: snapshot.nextEntityId,
    components: snapshot.components,
    queue,
  });
  return world;
}

/**
 * Rebuild a world purely from (seed, config, command log) by re-enqueueing
 * every logged command and running to `untilTick`. With a correct def this
 * reproduces the exact hash of the original run — the replay contract.
 */
export function replayWorld(
  def: WorldDef,
  options: WorldOptions & { log: readonly QueuedCommand[] },
  untilTick: number,
): World {
  const world = createWorld(def, { seed: options.seed, config: options.config ?? null });
  for (const cmd of options.log) {
    world.enqueueCommand(cmd.type, cmd.payload, cmd.tick);
  }
  world.run(untilTick);
  return world;
}
