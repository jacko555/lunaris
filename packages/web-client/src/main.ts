import {
  CMD_PLACE_BUILDING,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
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
import { Hud } from "./hud.js";
import { MapRenderer } from "./renderer.js";
import { SimHost, type SimSpeed } from "./sim-host.js";

const pack = loadContentPack("base", {
  constants: constantsDoc,
  resources: resourcesDoc,
  reactions: reactionsDoc,
  buildings: buildingsDoc,
  tech: techDoc,
  events: eventsDoc,
  encyclopedia: encyclopediaDoc,
  maps: mapsDoc,
});
const map = loadMap(pack.maps[0] as (typeof pack.maps)[number]);
const gameDef = createGameDef(pack, map);
const SEED = 20260610;

/** Find a flat class-B highland window for the demo base (deterministic). */
function findBuildSite(width: number, height: number): { x: number; y: number } {
  for (let y = 2; y < map.height - height - 2; y++) {
    for (let x = 2; x < map.width - width - 2; x++) {
      let ok = true;
      for (let dy = 0; dy < height && ok; dy++) {
        for (let dx = 0; dx < width && ok; dx++) {
          const tile = tileAt(map, x + dx, y + dy);
          ok = tile.illumClass === "B" && tile.slopeDeg <= 5 && tile.regolith === "highland";
        }
      }
      if (ok) {
        return { x, y };
      }
    }
  }
  throw new Error("No buildable site found on map");
}

const site = findBuildSite(9, 7);

function buildOutpost(world: World, withFission: boolean): void {
  const place = (defId: string, dx: number, dy: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy });
  };
  place("foundation-habitat", 0, 0); // 2×2
  place("solar-array-10kw", 3, 0); // 1×2
  place("solar-array-10kw", 5, 0);
  place("solar-array-10kw", 7, 0);
  place("battery-bank", 3, 3);
  place("battery-bank", 4, 3);
  place("radiator-wing", 6, 3); // 1×2
  if (withFission) {
    place("fission-surface-power", 0, 4); // 2×2
  }
}

function makeWorld(withFission: boolean): World {
  const world = createWorld(gameDef, {
    seed: SEED,
    config: { scenario: withFission ? "outpost-fission" : "outpost-solar" },
  });
  buildOutpost(world, withFission);
  world.tick(); // apply placements so the first frame shows the base
  return world;
}

async function start(): Promise<void> {
  const renderer = new MapRenderer(map, pack);
  await renderer.init(document.querySelector("#map-wrap") as HTMLElement);

  const host = new SimHost(makeWorld(false));
  const ticksPerLunarDay = pack.number("day_synodic") * 24;
  const hud = new Hud(ticksPerLunarDay);
  hud.resync(host.world);

  // ── controls ──
  const controls = document.querySelector("#controls") as HTMLElement;
  const speedButtons = new Map<SimSpeed, HTMLButtonElement>();
  const addButton = (
    label: string,
    onClick: (button: HTMLButtonElement) => void,
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", () => onClick(button));
    controls.appendChild(button);
    return button;
  };
  const setSpeed = (speed: SimSpeed): void => {
    host.speed = speed;
    for (const [s, b] of speedButtons) {
      b.classList.toggle("active", s === speed);
    }
  };
  speedButtons.set(
    0,
    addButton("⏸ Pause", () => setSpeed(0)),
  );
  speedButtons.set(
    1,
    addButton("▶ 1×", () => setSpeed(1)),
  );
  speedButtons.set(
    10,
    addButton("▶▶ 10×", () => setSpeed(10)),
  );
  speedButtons.set(
    60,
    addButton("▶▶▶ 60×", () => setSpeed(60)),
  );
  setSpeed(10);

  addButton("Reset: Solar+Battery", () => {
    host.replaceWorld(makeWorld(false));
    hud.resync(host.world);
  });
  addButton("Reset: +40 kWe Fission", () => {
    host.replaceWorld(makeWorld(true));
    hud.resync(host.world);
  });
  addButton("Add fission to current base", () => {
    host.world.enqueueCommand(CMD_PLACE_BUILDING, {
      defId: "fission-surface-power",
      x: site.x,
      y: site.y + 4,
    });
  });

  if (import.meta.env.DEV) {
    // Dev-only inspection handle (debugging aid, not part of the app API).
    (window as unknown as Record<string, unknown>)["__lunaris"] = { host, renderer, pack, map };
  }

  // ── frame loop ──
  const frame = (nowMs: number): void => {
    host.pump(nowMs);
    renderer.draw(host.world);
    hud.update(host.world);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
