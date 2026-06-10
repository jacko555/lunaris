import { describe, expect, it } from "vitest";
import {
  ConservationError,
  World,
  type LedgerReport,
  type ResourceStoreData,
} from "@lunaris/sim-core";

/**
 * Property test (TASKS.md M1, CLAUDE.md hard rule 3): for randomized but
 * seeded operation sequences, the per-tick change in total stored mass must
 * equal declared sources minus declared sinks. The world's tick loop
 * enforces this with a built-in check; here we both rely on it (no throw
 * across many random programs) and recompute the books independently.
 */

const RESOURCES = ["water", "o2-gas", "regolith", "food"];
const SOURCES = ["earth-import", "mre", "ice-mining"];
const SINKS = ["vent", "crew-consumption", "construction"];

/** Build a world whose single system performs rng-driven ledger ops. */
function randomLedgerWorld(seed: number): World {
  const world = new World({ seed });
  const entities = [world.createEntity(), world.createEntity(), world.createEntity()];
  world.registerSystem({
    name: "chaos",
    update: (w) => {
      const ops = w.rng.nextInt(1, 8);
      for (let i = 0; i < ops; i++) {
        const entity = entities[w.rng.nextInt(0, entities.length - 1)] as number;
        const resource = RESOURCES[w.rng.nextInt(0, RESOURCES.length - 1)] as string;
        const kg = w.rng.next() * 20;
        switch (w.rng.nextInt(0, 2)) {
          case 0:
            w.resources.add(
              entity,
              resource,
              kg,
              SOURCES[w.rng.nextInt(0, SOURCES.length - 1)] as string,
            );
            break;
          case 1:
            w.resources.removeUpTo(
              entity,
              resource,
              kg,
              SINKS[w.rng.nextInt(0, SINKS.length - 1)] as string,
            );
            break;
          case 2: {
            const target = entities[w.rng.nextInt(0, entities.length - 1)] as number;
            const available = w.resources.amount(entity, resource);
            w.resources.transfer(entity, target, resource, available * w.rng.next());
            break;
          }
        }
      }
    },
  });
  return world;
}

function declaredNet(report: LedgerReport): number {
  let net = 0;
  for (const kg of Object.values(report.createdKg)) {
    net += kg;
  }
  for (const kg of Object.values(report.destroyedKg)) {
    net -= kg;
  }
  return net;
}

describe("mass conservation invariant", () => {
  it("holds for every tick of 50 randomized seeded programs", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const world = randomLedgerWorld(seed);
      let previousTotal = world.resources.totalKg();
      for (let t = 0; t < 40; t++) {
        world.tick(); // throws ConservationError on violation
        const report = world.ledgerReport();
        expect(report).not.toBeNull();
        const total = world.resources.totalKg();
        // Independent re-check of the books (quantization allows tiny slack).
        expect(total - previousTotal).toBeCloseTo(declaredNet(report as LedgerReport), 5);
        previousTotal = total;
      }
    }
  });

  it("catches a system that creates mass without a declared source", () => {
    const world = new World({ seed: 1 });
    const store = world.store<ResourceStoreData>("resources");
    const entity = world.createEntity();
    world.registerSystem({
      name: "counterfeiter",
      update: () => {
        const data = store.get(entity) ?? { amounts: {} };
        data.amounts["water"] = (data.amounts["water"] ?? 0) + 5;
        store.set(entity, data);
      },
    });
    expect(() => world.tick()).toThrow(ConservationError);
  });

  it("catches a system that destroys mass without a declared sink", () => {
    const world = new World({ seed: 2 });
    const store = world.store<ResourceStoreData>("resources");
    const entity = world.createEntity();
    world.resources.add(entity, "water", 100, "earth-import");
    world.registerSystem({
      name: "embezzler",
      update: () => {
        store.require(entity).amounts["water"] = 1;
      },
    });
    expect(() => world.tick()).toThrow(ConservationError);
  });

  it("transfers alone never change total mass", () => {
    const world = new World({ seed: 3 });
    const a = world.createEntity();
    const b = world.createEntity();
    world.resources.add(a, "water", 1000, "earth-import");
    world.registerSystem({
      name: "shuffler",
      update: (w) => {
        const fromA = w.resources.amount(a, "water");
        w.resources.transfer(a, b, "water", fromA * 0.3);
        const fromB = w.resources.amount(b, "water");
        w.resources.transfer(b, a, "water", fromB * 0.7);
      },
    });
    const before = world.resources.totalKg();
    for (let t = 0; t < 200; t++) {
      world.tick();
      expect(world.resources.totalKg()).toBeCloseTo(before, 5);
    }
  });
});
