import {
  BUILDING_COMPONENT,
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_PLACE_BUILDING,
  CMD_QUEUE_BUILD,
  CMD_SCHEDULE_RESUPPLY,
  CMD_TRIGGER_SPE,
  CREW_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  tileAt,
  type BuildingComponent,
  type CrewComponent,
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
import {
  handleResearchEvents,
  renderBuildMenu,
  renderColonyPanel,
  renderFlows,
  renderSupplyPanel,
  renderTechPanel,
  type UiState,
} from "./panels.js";
import { MapRenderer } from "./renderer.js";
import { SimHost, type SimSpeed } from "./sim-host.js";
import { renderTutorial } from "./tutorial.js";

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
const HAB = 4;
const STORAGE_DEPOT = 7;

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
const CREW_NAMES = ["Reid", "Glover", "Koch", "Hansen"];

/**
 * "First Night" tutorial scenario (GDD §5): a bare-bones Phase-2 start —
 * habitat, solar, batteries, storage, field labs — with the crew and seed
 * cargo inbound. The player must build power, thermal, ECLSS, and shelter
 * before the night, then research their way to first lunar water.
 */
function makeTutorialWorld(): World {
  const world = createWorld(gameDef, {
    seed: SEED,
    config: {
      scenario: "first-night-tutorial",
      startPhase: 2,
      startBudgetUsd: 25e9,
      annualBudgetUsd: 8e9,
      failureTables: "ideal",
      startTechs: [
        "eclss_baseline",
        "surface_power_40kw",
        "regen_fuel_cells",
        "ice_prospecting",
        "night_landing_nav",
      ],
    },
  });
  const place = (defId: string, dx: number, dy: number): void => {
    world.enqueueCommand(CMD_PLACE_BUILDING, { defId, x: site.x + dx, y: site.y + dy });
  };
  place("foundation-habitat", 0, 0); // 4
  place("solar-array-10kw", 3, 0); // 5
  place("solar-array-10kw", 5, 0); // 6
  place("water-gas-storage", 6, 5); // 7
  place("battery-bank", 3, 3); // 8
  place("battery-bank", 4, 3); // 9
  place("field-lab", 9, 0); // 10
  place("field-lab", 10, 0); // 11
  // Seed cargo: consumables plus the hardware mass for the buildings the
  // tutorial asks for (fission 6 t, radiator 0.8 t, ECLSS 2.5 t, shelter
  // 3 t). Heavy-lift caps at 12 t, so three landers.
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 300 },
      { resource: "water", kg: 2000 },
      { resource: "o2-gas", kg: 200 },
      { resource: "medkits", kg: 10 },
      { resource: "spare-parts", kg: 800 },
    ],
    arrivalTick: 0,
    targetEntity: STORAGE_DEPOT,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [{ resource: "machine-components", kg: 8000 }],
    arrivalTick: 0,
    targetEntity: STORAGE_DEPOT,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [{ resource: "machine-components", kg: 7000 }],
    arrivalTick: 24,
    targetEntity: STORAGE_DEPOT,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 120 },
      { resource: "medkits", kg: 5 },
      { resource: "spare-parts", kg: 300 },
    ],
    arrivalTick: 709,
    repeatTicks: 709,
    targetEntity: STORAGE_DEPOT,
    vehicle: "heavy",
  });
  // Crew touch down on day ~10 — enough time for a decisive player to have
  // the ECLSS core and reactor standing (the GDD's forgiving-early rule).
  for (const name of CREW_NAMES) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: HAB }, 250);
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

  const host = new SimHost(makeTutorialWorld());
  const hud = new Hud(pack.number("day_synodic") * 24, pack);
  hud.resync(host.world);

  const ui: UiState = { tab: "roster", selectedBuild: null, flowResource: "water" };
  const panels: Record<string, HTMLElement> = {
    roster: document.querySelector("#roster") as HTMLElement,
    build: document.querySelector("#build-panel") as HTMLElement,
    tech: document.querySelector("#tech-panel") as HTMLElement,
    colony: document.querySelector("#colony-panel") as HTMLElement,
    supply: document.querySelector("#supply-panel") as HTMLElement,
    flows: document.querySelector("#flows-panel") as HTMLElement,
  };
  const tabBar = document.querySelector("#tabs") as HTMLElement;
  const tabNames: [string, string][] = [
    ["roster", "Crew"],
    ["build", "Build"],
    ["tech", "Tech"],
    ["colony", "Colony"],
    ["supply", "Supply"],
    ["flows", "Flows"],
  ];
  const setTab = (tab: string): void => {
    ui.tab = tab;
    for (const [name, element] of Object.entries(panels)) {
      element.hidden = name !== tab;
    }
    for (const button of tabBar.children) {
      button.classList.toggle("active", button.getAttribute("data-tab") === tab);
    }
  };
  for (const [name, label] of tabNames) {
    const button = document.createElement("button");
    button.textContent = label;
    button.setAttribute("data-tab", name);
    button.addEventListener("click", () => setTab(name));
    tabBar.appendChild(button);
  }
  setTab("roster");
  handleResearchEvents(panels["tech"] as HTMLElement, () => host.world);

  // ── map interaction: inspect, or place when a build card is selected ──
  renderer.app.canvas.addEventListener("click", (event) => {
    const rect = renderer.app.canvas.getBoundingClientRect();
    const tx = Math.floor(((event.clientX - rect.left) / rect.width) * map.width);
    const ty = Math.floor(((event.clientY - rect.top) / rect.height) * map.height);
    if (ui.selectedBuild !== null) {
      host.world.enqueueCommand(CMD_QUEUE_BUILD, { defId: ui.selectedBuild, x: tx, y: ty });
      ui.selectedBuild = null;
      return;
    }
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
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      ui.selectedBuild = null;
    }
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

  addButton("Restart tutorial", () => {
    host.replaceWorld(makeTutorialWorld());
    hud.resync(host.world);
  });
  addButton("☀ SPE 300 mSv", () => {
    host.world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 300 });
  });
  addButton("Crew → shelter", () => {
    const shelters = [...host.world.store<BuildingComponent>(BUILDING_COMPONENT).entries()].filter(
      ([, b]) => (pack.building(b.defId).services.shelter ?? 0) > 0,
    );
    if (shelters.length === 0) {
      return;
    }
    for (const entity of livingCrewEntities(host.world)) {
      host.world.enqueueCommand(CMD_ASSIGN_CREW, {
        crew: entity,
        location: (shelters[0] as [number, BuildingComponent])[0],
      });
    }
  });
  addButton("Crew → habitat", () => {
    for (const entity of livingCrewEntities(host.world)) {
      host.world.enqueueCommand(CMD_ASSIGN_CREW, { crew: entity, location: HAB });
    }
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__lunaris"] = { host, renderer, pack, map };
  }

  // ── frame loop ──
  const tutorialRoot = document.querySelector("#tutorial") as HTMLElement;
  let frameCount = 0;
  const frame = (nowMs: number): void => {
    host.pump(nowMs);
    renderer.draw(host.world);
    hud.update(host.world);
    if (frameCount % 15 === 0) {
      // Panels re-render 4×/s: cheap DOM, no need for per-frame churn.
      renderTutorial(tutorialRoot, host.world);
      if (ui.tab === "build") {
        renderBuildMenu(panels["build"] as HTMLElement, host.world, pack, ui, (defId) => {
          ui.selectedBuild = defId;
        });
      } else if (ui.tab === "tech") {
        renderTechPanel(panels["tech"] as HTMLElement, host.world, pack);
      } else if (ui.tab === "colony") {
        renderColonyPanel(panels["colony"] as HTMLElement, host.world);
      } else if (ui.tab === "supply") {
        renderSupplyPanel(panels["supply"] as HTMLElement, host.world, pack, STORAGE_DEPOT);
      } else if (ui.tab === "flows") {
        renderFlows(panels["flows"] as HTMLElement, host.world, pack, ui, (resource) => {
          ui.flowResource = resource;
        });
      }
    }
    frameCount++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void start();
