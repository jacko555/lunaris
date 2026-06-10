import { describe, expect, it } from "vitest";
import { ComponentStore } from "../ecs/component-store.js";
import { ConservationError, ResourceLedger, type ResourceStoreData } from "../resources/ledger.js";

function makeLedger(): { ledger: ResourceLedger; store: ComponentStore<ResourceStoreData> } {
  const store = new ComponentStore<ResourceStoreData>("resources");
  const ledger = new ResourceLedger(store);
  ledger.beginTick();
  return { ledger, store };
}

describe("ResourceLedger", () => {
  it("tracks amounts through add/remove/transfer", () => {
    const { ledger } = makeLedger();
    ledger.add(1, "water", 100, "earth-import");
    ledger.transfer(1, 2, "water", 40);
    ledger.remove(2, "water", 10, "vent");
    expect(ledger.amount(1, "water")).toBe(60);
    expect(ledger.amount(2, "water")).toBe(30);
    expect(ledger.totalOf("water")).toBe(90);
    expect(ledger.totalKg()).toBe(90);
  });

  it("passes the conservation check when all flows are declared", () => {
    const { ledger } = makeLedger();
    ledger.add(1, "o2-gas", 5, "mre");
    ledger.remove(1, "o2-gas", 2, "crew-breathing");
    const report = ledger.endTick(0);
    expect(report.createdKg).toEqual({ mre: 5 });
    expect(report.destroyedKg).toEqual({ "crew-breathing": 2 });
    expect(report.netDeltaKg).toBeCloseTo(3, 9);
  });

  it("throws ConservationError when stores are mutated directly", () => {
    const { ledger, store } = makeLedger();
    ledger.add(1, "water", 10, "earth-import");
    // A cheating system bypasses the ledger:
    store.require(1).amounts["water"] = 999;
    expect(() => ledger.endTick(0)).toThrow(ConservationError);
  });

  it("rejects overdrafts, negative masses, and empty tags", () => {
    const { ledger } = makeLedger();
    ledger.add(1, "water", 1, "earth-import");
    expect(() => ledger.remove(1, "water", 2, "vent")).toThrow(/cannot withdraw/);
    expect(() => ledger.add(1, "water", -5, "earth-import")).toThrow(ConservationError);
    expect(() => ledger.add(1, "water", NaN, "earth-import")).toThrow(ConservationError);
    expect(() => ledger.add(1, "water", 1, "  ")).toThrow(/non-empty source/);
    expect(() => ledger.transfer(1, 2, "water", -1)).toThrow(ConservationError);
  });

  it("removeUpTo clamps to the available amount", () => {
    const { ledger } = makeLedger();
    ledger.add(1, "food", 3, "earth-import");
    expect(ledger.removeUpTo(1, "food", 5, "crew-meals")).toBe(3);
    expect(ledger.removeUpTo(1, "food", 5, "crew-meals")).toBe(0);
    expect(ledger.amount(1, "food")).toBe(0);
  });

  it("deletes zero entries so emptied and never-held hash identically", () => {
    const { ledger, store } = makeLedger();
    ledger.add(1, "water", 5, "earth-import");
    ledger.remove(1, "water", 5, "vent");
    expect(store.require(1).amounts).toEqual({});
  });

  it("clearEntity sinks everything the entity held", () => {
    const { ledger, store } = makeLedger();
    ledger.add(1, "water", 5, "earth-import");
    ledger.add(1, "o2-gas", 2, "earth-import");
    ledger.clearEntity(1, "entity-destroyed");
    expect(store.has(1)).toBe(false);
    const report = ledger.endTick(0);
    expect(report.destroyedKg["entity-destroyed"]).toBe(7);
  });
});
