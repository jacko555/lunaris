import { readFileSync } from "node:fs";
import {
  loadContentPack,
  vehicleClass,
  type Building,
  type ContentPack,
} from "../packages/sim-core/src/index.js";

/**
 * Balance report (CLAUDE.md tooling): per-building production economics at
 * duty 1, plus the make-vs-buy comparison the whole game hangs on — what a
 * kilogram of water/O₂ costs via the ISRU chain (energy + hardware import
 * mass amortized) versus the heavy-lander landed price.
 *
 * Usage: npx tsx tools/balance.ts
 */

const read = (name: string): unknown =>
  JSON.parse(readFileSync(`data/base/${name}.json`, "utf8")) as unknown;
const pack: ContentPack = loadContentPack("base", {
  constants: read("constants"),
  resources: read("resources"),
  reactions: read("reactions"),
  buildings: read("buildings"),
  tech: read("tech"),
  events: read("events"),
  encyclopedia: read("encyclopedia"),
  maps: read("maps"),
  scenarios: read("scenarios"),
} as never);

const importUsdPerKg = vehicleClass(pack, "heavy").usdPerKg;
const pad = (value: string | number, width: number): string => String(value).padEnd(width);

console.log(
  `LUNARIS balance report — heavy-lander landed cost $${importUsdPerKg.toLocaleString()}/kg\n`,
);

// ── per-building production economics ──
console.log("PRODUCTION (duty 1.0, per day)");
console.log(
  `${pad("building", 26)}${pad("kW", 7)}${pad("reaction", 22)}${pad("primary kg/d", 14)}kWh per primary kg`,
);
const producers: Building[] = pack.buildings.filter(
  (b) => b.reactions.length > 0 || b.mining !== undefined,
);
for (const def of producers) {
  if (def.mining !== undefined) {
    const kwhPerKg = def.mining.energyKwhPerKg;
    console.log(
      `${pad(def.id, 26)}${pad(def.powerKw, 7)}${pad("(mining)", 22)}${pad(def.mining.kgPerDay, 14)}${kwhPerKg.toFixed(2)}`,
    );
  }
  for (const rid of def.reactions) {
    const rate = def.reactionKgPerDay[rid] ?? 0;
    const kwhPerKg = rate > 0 ? (Math.abs(Math.min(0, def.powerKw)) * 24) / rate : 0;
    console.log(
      `${pad(def.id, 26)}${pad(def.powerKw, 7)}${pad(rid, 22)}${pad(rate, 14)}${kwhPerKg.toFixed(2)}`,
    );
  }
}

// ── reaction stoichiometry sanity ──
console.log("\nREACTIONS (per batch)");
for (const reaction of pack.reactions) {
  const ins = reaction.inputs.map((i) => `${i.kg} ${i.resource}`).join(" + ");
  const outs = reaction.outputs.map((o) => `${o.kg} ${o.resource}`).join(" + ");
  const massIn = reaction.inputs.reduce((s, i) => s + i.kg, 0);
  const massOut = reaction.outputs.reduce((s, o) => s + o.kg, 0) + (reaction.ventedLossKg ?? 0);
  const balanced = Math.abs(massIn - massOut) < 1e-6 ? "balanced" : `IMBALANCE ${massIn - massOut}`;
  console.log(`  ${reaction.id}: ${ins} -> ${outs}  [${balanced}]`);
}

// ── make vs buy: the water chain ──
// Chain at the SDD reference site: harvester mines icy regolith (5.6% ice),
// oven extracts water. Hardware import mass amortized over 5 years.
console.log("\nMAKE vs BUY (water, 5-year hardware amortization)");
const harvester = pack.building("ice-harvester");
const oven = pack.building("volatile-oven");
const iceFrac = 0.056;
if (harvester.mining !== undefined) {
  const icePerDay = harvester.mining.kgPerDay * iceFrac;
  const ovenRate = oven.reactionKgPerDay["ice-extraction"] ?? 0;
  const waterPerDay = Math.min(icePerDay, ovenRate);
  const hardwareKg = harvester.massKg + oven.massKg;
  const hardwareUsd = hardwareKg * importUsdPerKg;
  const amortUsdPerKg = hardwareUsd / (waterPerDay * 365 * 5);
  const energyKwhPerKg =
    ((Math.abs(Math.min(0, harvester.powerKw)) + Math.abs(Math.min(0, oven.powerKw))) * 24) /
    waterPerDay;
  console.log(`  chain water output: ${waterPerDay.toFixed(1)} kg/day (ice ${iceFrac * 100}%)`);
  console.log(`  hardware: ${hardwareKg} kg imported = $${(hardwareUsd / 1e6).toFixed(1)}M`);
  console.log(`  amortized ISRU cost: $${amortUsdPerKg.toFixed(0)}/kg water`);
  console.log(`  import cost:         $${importUsdPerKg.toLocaleString()}/kg water`);
  console.log(
    `  ISRU advantage: ${(importUsdPerKg / amortUsdPerKg).toFixed(1)}x  (energy ${energyKwhPerKg.toFixed(1)} kWh/kg)`,
  );
}

// ── rover expedition economics ──
console.log("\nROVER CLASSES");
for (const kind of ["scout", "prospector", "sampler"]) {
  const value = pack.constant(`rover_${kind}`).value as Record<string, number>;
  const rangeKm = ((value["batteryKwh"] as number) / (value["drainKwhPerKm"] as number)) * 0.45;
  console.log(
    `  ${pad(kind, 12)}$${pad(((value["costUsd"] as number) / 1e6).toFixed(0) + "M", 7)}round trip ~${rangeKm.toFixed(0)} km · survey ${value["surveyHours"]} h · hold ${value["cargoKg"]} kg`,
  );
}
