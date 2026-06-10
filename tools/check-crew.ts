import { readFileSync } from "node:fs";
import {
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  scenarioSeed,
  scenarioToConfig,
  type BuildingComponent,
  type CrewComponent,
  type Scenario,
} from "../packages/sim-core/src/index.js";

const read = (n: string): unknown =>
  JSON.parse(readFileSync(`data/base/${n}.json`, "utf8")) as unknown;
const pack = loadContentPack("base", {
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
const map = loadMap(pack.maps[0] as (typeof pack.maps)[number]);
const def = createGameDef(pack, map);
const sc = pack.scenarios.find((s) => s.id === "ideal_trajectory") as Scenario;
(globalThis as never as Record<string, unknown>)["__POLDBG"] = 1;
const world = createWorld(def, { seed: scenarioSeed(sc, 1), config: scenarioToConfig(sc) });

for (let day = 1; day <= 3 * 365; day++) {
  world.run(24);
  if (day % 90 !== 0) {
    continue;
  }
  const buildings = [...world.store<BuildingComponent>("building").entries()];
  const byDef = new Map<string, number>();
  for (const [, b] of buildings) {
    byDef.set(b.defId, (byDef.get(b.defId) ?? 0) + 1);
  }
  let housing = 0;
  for (const [, b] of buildings) {
    housing += pack.building(b.defId).services.housing ?? 0;
  }
  const crew = [...world.store<CrewComponent>("crew").entries()].filter(
    ([, c]) => c.alive === 1,
  ).length;
  const food = buildings.reduce((s, [e]) => s + world.resources.amount(e, "food"), 0);
  const o2 = buildings.reduce((s, [e]) => s + world.resources.amount(e, "o2-gas"), 0);
  const phase = world.store("phase").require(2) as { phase: number };
  const sites = [
    ...(
      world.store("construction-site") as never as Map<
        number,
        { defId: string; paid: number; progressHours: number; totalHours: number }
      >
    ).entries(),
  ]
    .map(([, s]) => `${s.defId}(paid=${s.paid},${s.progressHours}/${s.totalHours})`)
    .join(",");
  const mc = buildings.reduce((s, [e]) => s + world.resources.amount(e, "machine-components"), 0);
  const econ = world.store("economy").require(2) as {
    balanceUsd: number;
    totalLaunchSpendUsd: number;
    annualBudgetUsd: number;
  };
  console.log(
    `d${day} $${(econ.balanceUsd / 1e9).toFixed(2)}B launch=$${(econ.totalLaunchSpendUsd / 1e9).toFixed(1)}B phase=${phase.phase} crew=${crew} housing=${housing} inFlight=${world.store("resupply").size} food=${food.toFixed(0)} o2=${o2.toFixed(0)} fission=${byDef.get("fission-surface-power") ?? 0} eclss=${byDef.get("eclss-core") ?? 0} hab=${byDef.get("foundation-habitat") ?? 0} mc=${mc.toFixed(0)} sites=[${sites}]`,
  );
}

const alerts = (
  world.store("alerts").require(3) as never as {
    entries: { tick: number; severity: string; code: string; message: string }[];
  }
).entries;
for (const a of alerts.filter((x) => x.severity !== "info").slice(-40)) {
  console.log("t" + a.tick, a.code, "—", a.message.slice(0, 100));
}
