import {
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  type World,
} from "@lunaris/sim-core";
import constantsDoc from "../../../data/base/constants.json";
import resourcesDoc from "../../../data/base/resources.json";
import reactionsDoc from "../../../data/base/reactions.json";
import buildingsDoc from "../../../data/base/buildings.json";
import techDoc from "../../../data/base/tech.json";
import eventsDoc from "../../../data/base/events.json";
import encyclopediaDoc from "../../../data/base/encyclopedia.json";
import mapsDoc from "../../../data/base/maps.json";
import scenariosDoc from "../../../data/base/scenarios.json";
import { OBSERVER_SERIES } from "./observer.js";

/**
 * Shadow-world worker (TAD §2, first step): the dual-run compare world —
 * same seed, flipped failure tables — is pure compute with a tiny output
 * (six numbers per game-day), so it moves off the main thread whole. The
 * INTERACTIVE world stays on the main thread for now; its read surface
 * (every panel) is the expensive part of a full migration.
 *
 * Protocol: {type:"init", seed, config} → {type:"advance", toTick} →
 * {type:"samples", tick, rows:[{key, value}...]} per game-day crossed.
 * The worker always simulates the BASE pack — modded sessions skip the
 * shadow compare entirely (the comparison would be meaningless anyway).
 */

const pack = loadContentPack("base", {
  constants: constantsDoc,
  resources: resourcesDoc,
  reactions: reactionsDoc,
  buildings: buildingsDoc,
  tech: techDoc,
  events: eventsDoc,
  encyclopedia: encyclopediaDoc,
  maps: mapsDoc,
  scenarios: scenariosDoc,
});
const gameDefs = new Map<string, ReturnType<typeof createGameDef>>();
function gameDefFor(site: string): ReturnType<typeof createGameDef> {
  let def = gameDefs.get(site);
  if (def === undefined) {
    const doc = pack.maps.find((m) => m.id === site) ?? pack.maps[0];
    def = createGameDef(pack, loadMap(doc as (typeof pack.maps)[number]));
    gameDefs.set(site, def);
  }
  return def;
}

let world: World | null = null;

type InMsg =
  | { type: "init"; seed: number; config: Record<string, unknown> }
  | { type: "advance"; toTick: number };

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  if (msg.type === "init") {
    const site = (msg.config["site"] as string | undefined) ?? "shackleton_rim";
    world = createWorld(gameDefFor(site), { seed: msg.seed, config: msg.config as never });
    return;
  }
  if (msg.type === "advance" && world !== null) {
    const rows: { key: string; value: number }[] = [];
    while (world.tickCount < msg.toTick) {
      world.tick();
      if (world.tickCount % 24 === 0) {
        for (const series of OBSERVER_SERIES) {
          rows.push({ key: series.key, value: series.sample(world) });
        }
      }
    }
    if (rows.length > 0) {
      self.postMessage({ type: "samples", tick: world.tickCount, rows });
    }
  }
};
