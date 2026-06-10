import { describe, expect, it } from "vitest";
import { createWorld, loadWorld, replayWorld, saveWorld, type WorldDef } from "../save.js";
import type { World } from "../ecs/world.js";

type Tank = { capacityKg: number };

/** A small but representative def: rng-driven system + commands + ledger. */
const def: WorldDef = {
  setup(world: World): void {
    const tanks = world.registerComponent<Tank>("tank");
    world.registerSystem({
      name: "slosh",
      update: (w) => {
        const ids = tanks.entities();
        if (ids.length < 2) {
          return;
        }
        const from = ids[w.rng.nextInt(0, ids.length - 1)] as number;
        const to = ids[w.rng.nextInt(0, ids.length - 1)] as number;
        const kg = w.resources.removeUpTo(from, "water", 0.5, "slosh-spill");
        w.resources.add(to, "water", kg, "slosh-condense");
      },
    });
    world.registerCommandHandler("spawn-tank", (w, payload) => {
      const { waterKg } = payload as { waterKg: number };
      const id = w.createEntity();
      tanks.set(id, { capacityKg: 100 });
      w.resources.add(id, "water", waterKg, "earth-import");
    });
  },
};

describe("save/load", () => {
  it("save → load reproduces an identical state hash (acceptance criterion)", () => {
    const world = createWorld(def, { seed: 99, config: { difficulty: "hard" } });
    world.enqueueCommand("spawn-tank", { waterKg: 50 }, 0);
    world.enqueueCommand("spawn-tank", { waterKg: 30 }, 0);
    world.run(250);

    const save = saveWorld(world);
    const loaded = loadWorld(def, save);
    expect(loaded.hash()).toBe(world.hash());
    expect(loaded.config).toEqual({ difficulty: "hard" });
  });

  it("loaded worlds continue identically to the uninterrupted original", () => {
    const original = createWorld(def, { seed: 123 });
    original.enqueueCommand("spawn-tank", { waterKg: 40 }, 0);
    original.enqueueCommand("spawn-tank", { waterKg: 10 }, 0);
    original.run(100);

    const loaded = loadWorld(def, saveWorld(original));
    original.run(100);
    loaded.run(100);
    expect(loaded.hash()).toBe(original.hash());
  });

  it("preserves commands scheduled beyond the save tick", () => {
    const original = createWorld(def, { seed: 5 });
    original.enqueueCommand("spawn-tank", { waterKg: 20 }, 0);
    original.enqueueCommand("spawn-tank", { waterKg: 60 }, 150); // future
    original.run(100);

    const loaded = loadWorld(def, saveWorld(original));
    original.run(100);
    loaded.run(100);
    expect(loaded.hash()).toBe(original.hash());
    expect(loaded.resources.totalOf("water")).toBeCloseTo(80, 6);
  });

  it("a save is detached from the live world", () => {
    const world = createWorld(def, { seed: 7 });
    world.enqueueCommand("spawn-tank", { waterKg: 25 }, 0);
    world.run(10);
    const save = saveWorld(world);
    const before = JSON.stringify(save);
    world.run(50);
    expect(JSON.stringify(save)).toBe(before);
  });

  it("replay from the command log reproduces the original hash", () => {
    const original = createWorld(def, { seed: 2026 });
    original.enqueueCommand("spawn-tank", { waterKg: 12 }, 0);
    original.enqueueCommand("spawn-tank", { waterKg: 34 }, 20);
    original.run(300);

    const replayed = replayWorld(def, { seed: 2026, log: original.commandLog() }, 300);
    expect(replayed.hash()).toBe(original.hash());
  });

  it("rejects foreign formats, future versions, and unknown stores", () => {
    const world = createWorld(def, { seed: 1 });
    const save = saveWorld(world);
    expect(() => loadWorld(def, { ...save, format: "other" as never })).toThrow(/Not a LUNARIS/);
    expect(() => loadWorld(def, { ...save, version: 999 })).toThrow(/Unsupported save version/);
    const corrupted = { ...save, components: { ...save.components, ghost: [] } };
    expect(() => loadWorld(def, corrupted)).toThrow(/unknown component store 'ghost'/);
  });
});
