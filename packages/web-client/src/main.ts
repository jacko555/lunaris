import {
  BUILDING_COMPONENT,
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_CANCEL_RESUPPLY,
  CMD_PLACE_BUILDING,
  CMD_SCHEDULE_RESUPPLY,
  CMD_TRIGGER_SPE,
  CREW_COMPONENT,
  RESUPPLY_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
  type BuildingComponent,
  type CrewComponent,
  type ResupplyComponent,
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
const TICKS_PER_LUNAR_DAY = 709;
const HAB = 4;
const STORAGE_DEPOT = 11;

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

const site = findBuildSite(12, 8);
const CREW_NAMES = ["Reid", "Glover", "Koch", "Hansen", "Mann", "Wakata"];

/** The Milestone 3 crewed outpost (mirrors tests/golden/m3-crew.test.ts). */
function makeCrewedWorld(withResupply: boolean): World {
  const world = createWorld(gameDef, {
    seed: SEED,
    config: { scenario: withResupply ? "m3-crewed-outpost" : "m3-resupply-cutoff" },
  });
  const place = (defId: string, dx: number, dy: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy });
  };
  place("foundation-habitat", 0, 0); // 4
  place("foundation-habitat", 0, 3); // 5
  place("fission-surface-power", 3, 0); // 6
  place("radiator-wing", 3, 3); // 7
  place("radiator-wing", 4, 3); // 8
  place("eclss-core", 5, 0); // 9
  place("storm-shelter", 5, 2); // 10
  place("water-gas-storage", 6, 5); // 11
  place("exercise-module", 7, 0); // 12
  place("exercise-module", 7, 2); // 13
  place("clinic", 9, 2); // 14
  place("comms-tower", 9, 0); // 15
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 250 },
      { resource: "water", kg: 2500 },
      { resource: "o2-gas", kg: 150 },
      { resource: "medkits", kg: 10 },
    ],
    arrivalTick: 0,
    targetEntity: STORAGE_DEPOT,
  });
  if (withResupply) {
    world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
      manifest: [
        { resource: "food", kg: 140 },
        { resource: "water", kg: 250 },
        { resource: "medkits", kg: 5 },
      ],
      arrivalTick: TICKS_PER_LUNAR_DAY,
      repeatTicks: TICKS_PER_LUNAR_DAY,
      targetEntity: STORAGE_DEPOT,
    });
  }
  for (const name of CREW_NAMES) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: HAB }, 1);
  }
  return world;
}

function livingCrewEntities(world: World): number[] {
  return [...world.store<CrewComponent>(CREW_COMPONENT).entries()]
    .filter(([, crew]) => crew.alive === 1)
    .map(([entity]) => entity);
}

async function start(): Promise<void> {
  const renderer = new MapRenderer(map, pack);
  await renderer.init(document.querySelector("#map-wrap") as HTMLElement);

  const host = new SimHost(makeCrewedWorld(true));
  const hud = new Hud(pack.number("day_synodic") * 24, pack);
  hud.resync(host.world);

  // Click-to-inspect: map a canvas click to the building occupying the tile.
  renderer.app.canvas.addEventListener("click", (event) => {
    const rect = renderer.app.canvas.getBoundingClientRect();
    const tx = Math.floor(((event.clientX - rect.left) / rect.width) * map.width);
    const ty = Math.floor(((event.clientY - rect.top) / rect.height) * map.height);
    const buildings = host.world.store<BuildingComponent>(BUILDING_COMPONENT);
    let found: number | null = null;
    for (const [entity, building] of buildings.entries()) {
      const [w, h] = pack.building(building.defId).footprint;
      if (tx >= building.x && tx < building.x + w && ty >= building.y && ty < building.y + h) {
        found = entity;
      }
    }
    hud.select(found);
  });

  // ── controls ──
  const controls = document.querySelector("#controls") as HTMLElement;
  const speedButtons = new Map<SimSpeed, HTMLButtonElement>();
  const addButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", onClick);
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
    addButton("⏸", () => setSpeed(0)),
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

  addButton("Reset outpost", () => {
    host.replaceWorld(makeCrewedWorld(true));
    hud.resync(host.world);
  });
  addButton("Kill resupply", () => {
    const missions = host.world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
    for (const entity of missions.entities()) {
      host.world.enqueueCommand(CMD_CANCEL_RESUPPLY, { entity });
    }
  });
  addButton("☀ SPE 300 mSv", () => {
    host.world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 300 });
  });
  addButton("Crew → shelter", () => {
    for (const entity of livingCrewEntities(host.world)) {
      host.world.enqueueCommand(CMD_ASSIGN_CREW, { crew: entity, location: 10 });
    }
  });
  addButton("Crew → habitat", () => {
    for (const entity of livingCrewEntities(host.world)) {
      host.world.enqueueCommand(CMD_ASSIGN_CREW, { crew: entity, location: HAB });
    }
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
