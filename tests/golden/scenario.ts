import { createWorld, type EntityId, type World, type WorldDef } from "@lunaris/sim-core";

/**
 * Milestone 1 golden scenario: a synthetic but representative workload that
 * exercises every determinism-relevant mechanism — RNG draws, scripted
 * commands (including same-tick ordering), ledger sources/sinks/transfers,
 * entity creation, and float accumulation that the quantizer must tame.
 *
 * Real gameplay systems replace this from Milestone 2; the golden contract
 * (fixed seed + scripted commands ⇒ fixed hash) stays the same.
 */

export const GOLDEN_SEED = 20260610;
export const GOLDEN_TICKS = 1000;

type Tank = { capacityKg: number; wear: number };

export const goldenDef: WorldDef = {
  setup(world: World): void {
    const tanks = world.registerComponent<Tank>("tank");

    // Mixer: rng-driven transfers between tanks, occasional declared venting.
    world.registerSystem({
      name: "mixer",
      update: (w) => {
        const ids = tanks.entities();
        for (const id of ids) {
          const held = w.resources.amount(id, "water");
          if (held > 0 && ids.length > 1) {
            const others = ids.filter((other) => other !== id);
            const target = others[w.rng.nextInt(0, others.length - 1)] as EntityId;
            w.resources.transfer(id, target, "water", held * 0.01);
          }
          if (w.rng.chance(0.05)) {
            w.resources.removeUpTo(id, "o2-gas", 0.25, "test-vent");
          }
        }
      },
    });

    // Importer: scheduled deliveries every 24 ticks, plus wear accumulation
    // in awkward floating-point increments.
    world.registerSystem({
      name: "importer",
      update: (w) => {
        for (const [id, tank] of tanks.entries()) {
          tank.wear += 0.1 + 0.2 / 3;
          if (w.tickCount % 24 === 0) {
            w.resources.add(id, "o2-gas", 0.84, "earth-import");
          }
        }
      },
    });

    world.registerCommandHandler("spawn-tank", (w, payload) => {
      const { waterKg } = payload as { waterKg: number };
      const id = w.createEntity();
      tanks.set(id, { capacityKg: 1000, wear: 0 });
      w.resources.add(id, "water", waterKg, "earth-import");
    });

    world.registerCommandHandler("emergency-dump", (w, payload) => {
      const { entity } = payload as { entity: number };
      w.resources.removeUpTo(entity, "water", 50, "emergency-dump");
    });
  },
};

/** The scripted input log for the golden run. */
export function scriptCommands(world: World): void {
  world.enqueueCommand("spawn-tank", { waterKg: 500 }, 0);
  world.enqueueCommand("spawn-tank", { waterKg: 250 }, 0); // same tick: seq order matters
  world.enqueueCommand("spawn-tank", { waterKg: 125 }, 100);
  world.enqueueCommand("emergency-dump", { entity: 1 }, 500);
  world.enqueueCommand("emergency-dump", { entity: 2 }, 500);
}

export function runGoldenScenario(ticks: number = GOLDEN_TICKS): World {
  const world = createWorld(goldenDef, { seed: GOLDEN_SEED, config: { scenario: "golden-m1" } });
  scriptCommands(world);
  world.run(ticks);
  return world;
}
