import { describe, expect, it } from "vitest";
import { World } from "../ecs/world.js";
import type { JsonValue } from "../types.js";

type Counter = { value: number };

function makeWorld(seed = 42): World {
  return new World({ seed });
}

describe("World", () => {
  it("allocates monotonically increasing entity ids", () => {
    const world = makeWorld();
    expect(world.createEntity()).toBe(1);
    expect(world.createEntity()).toBe(2);
  });

  it("rejects duplicate component, system, and handler registrations", () => {
    const world = makeWorld();
    world.registerComponent("dup");
    expect(() => world.registerComponent("dup")).toThrow(/already registered/);
    world.registerSystem({ name: "s", update: () => {} });
    expect(() => world.registerSystem({ name: "s", update: () => {} })).toThrow(
      /already registered/,
    );
    world.registerCommandHandler("c", () => {});
    expect(() => world.registerCommandHandler("c", () => {})).toThrow(/already registered/);
  });

  it("runs systems in registration order with dtHours = 1", () => {
    const world = makeWorld();
    const order: string[] = [];
    world.registerSystem({ name: "first", update: (_w, dt) => order.push(`first:${dt}`) });
    world.registerSystem({ name: "second", update: (_w, dt) => order.push(`second:${dt}`) });
    world.tick();
    expect(order).toEqual(["first:1", "second:1"]);
    expect(world.tickCount).toBe(1);
  });

  it("executes commands at their target tick in (tick, seq) order", () => {
    const world = makeWorld();
    const applied: string[] = [];
    world.registerCommandHandler("note", (_w, payload) => {
      applied.push(payload as string);
    });
    world.enqueueCommand("note", "b", 1);
    world.enqueueCommand("note", "a", 0);
    world.enqueueCommand("note", "a2", 0);
    world.tick(); // tick 0
    expect(applied).toEqual(["a", "a2"]);
    world.tick(); // tick 1
    expect(applied).toEqual(["a", "a2", "b"]);
  });

  it("rejects commands without a handler, in the past, or with bad payloads", () => {
    const world = makeWorld();
    world.registerCommandHandler("ok", () => {});
    expect(() => world.enqueueCommand("nope", null)).toThrow(/No handler/);
    world.tick();
    expect(() => world.enqueueCommand("ok", null, 0)).toThrow(/past tick/);
    expect(() => world.enqueueCommand("ok", { bad: NaN } as unknown as JsonValue)).toThrow(
      TypeError,
    );
  });

  it("logs every enqueued command for replay", () => {
    const world = makeWorld();
    world.registerCommandHandler("x", () => {});
    world.enqueueCommand("x", 1, 0);
    world.enqueueCommand("x", 2, 5);
    expect(world.commandLog().map((c) => c.payload)).toEqual([1, 2]);
  });

  it("produces identical hashes for identically-driven worlds", () => {
    const build = (): World => {
      const world = makeWorld(7);
      const store = world.registerComponent<Counter>("counter");
      world.registerSystem({
        name: "drift",
        update: (w) => {
          for (const [, data] of store.entries()) {
            data.value += w.rng.next();
          }
        },
      });
      world.registerCommandHandler("spawn", (w) => {
        store.set(w.createEntity(), { value: 0 });
      });
      world.enqueueCommand("spawn", null, 0);
      return world;
    };
    const a = build();
    const b = build();
    a.run(100);
    b.run(100);
    expect(a.hash()).toBe(b.hash());
    a.tick();
    expect(a.hash()).not.toBe(b.hash());
  });

  it("quantizes component state at tick end", () => {
    const world = makeWorld();
    const store = world.registerComponent<Counter>("counter");
    const id = world.createEntity();
    store.set(id, { value: 0 });
    world.registerSystem({
      name: "accumulate",
      update: () => {
        const data = store.require(id);
        data.value += 0.1;
        data.value += 0.2;
      },
    });
    world.tick();
    expect(store.require(id).value).toBe(0.3);
  });

  it("destroyEntity removes components and sinks held resources", () => {
    const world = makeWorld();
    const store = world.registerComponent<Counter>("counter");
    world.registerCommandHandler("setup", (w) => {
      const id = w.createEntity();
      store.set(id, { value: 1 });
      w.resources.add(id, "water", 10, "test-import");
    });
    world.registerCommandHandler("teardown", (w) => {
      w.destroyEntity(1);
    });
    world.enqueueCommand("setup", null, 0);
    world.tick();
    world.enqueueCommand("teardown", null, 1);
    world.tick();
    expect(store.has(1)).toBe(false);
    expect(world.resources.amount(1, "water")).toBe(0);
    expect(world.ledgerReport()?.destroyedKg["entity-destroyed"]).toBe(10);
  });
});
