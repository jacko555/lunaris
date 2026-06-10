import {
  BUILDING_COMPONENT,
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_PLACE_BUILDING,
  CMD_QUEUE_BUILD,
  CMD_SCHEDULE_RESUPPLY,
  CMD_SET_POLICY,
  CMD_TRIGGER_SPE,
  COLONY_ENTITY,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  PHASE_COMPONENT,
  createGameDef,
  createWorld,
  loadContentPack,
  loadMap,
  loadWorld,
  mergePacks,
  saveWorld,
  scenarioSeed,
  scenarioToConfig,
  tileAt,
  type BuildingComponent,
  type ContentPack,
  type CrewComponent,
  type EconomyComponent,
  type EnvironmentComponent,
  type LunarMap,
  type PhaseComponent,
  type Scenario,
  type World,
  type WorldDef,
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
import { Hud } from "./hud.js";
import { OBSERVER_SERIES, SeriesBuffer, drawSparkline, renderTimeline } from "./observer.js";
import {
  handleResearchEvents,
  renderBuildMenu,
  renderColonyPanel,
  renderFlows,
  renderLunarpedia,
  renderSupplyPanel,
  renderTechPanel,
  type UiState,
} from "./panels.js";
import { MapRenderer } from "./renderer.js";
import { SimHost, type SimSpeed } from "./sim-host.js";
import { renderTutorial } from "./tutorial.js";

const BASE_DOCS = {
  constants: constantsDoc,
  resources: resourcesDoc,
  reactions: reactionsDoc,
  buildings: buildingsDoc,
  tech: techDoc,
  events: eventsDoc,
  encyclopedia: encyclopediaDoc,
  maps: mapsDoc,
  scenarios: scenariosDoc,
};

const SEED = 20260610;
const CREW_NAMES = ["Reid", "Glover", "Koch", "Hansen"];

function findBuildSite(map: LunarMap, width: number, height: number): { x: number; y: number } {
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

/** "First Night" tutorial scenario (GDD §5) — see tutorial.ts. */
function makeTutorialWorld(pack: ContentPack, map: LunarMap, gameDef: WorldDef): World {
  void pack;
  const site = findBuildSite(map, 12, 8);
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
  place("foundation-habitat", 0, 0);
  place("solar-array-10kw", 3, 0);
  place("solar-array-10kw", 5, 0);
  place("water-gas-storage", 6, 5);
  place("battery-bank", 3, 3);
  place("battery-bank", 4, 3);
  place("field-lab", 9, 0);
  place("field-lab", 10, 0);
  // Seed cargo: consumables plus the hardware mass for the tutorial builds
  // (fission 6 t, radiators, ECLSS, shelter). Heavy-lift caps at 12 t.
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [
      { resource: "food", kg: 300 },
      { resource: "water", kg: 2000 },
      { resource: "o2-gas", kg: 200 },
      { resource: "medkits", kg: 10 },
      { resource: "spare-parts", kg: 800 },
    ],
    arrivalTick: 0,
    targetEntity: -1,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [{ resource: "machine-components", kg: 8000 }],
    arrivalTick: 0,
    targetEntity: -1,
    vehicle: "heavy",
  });
  world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
    manifest: [{ resource: "machine-components", kg: 7000 }],
    arrivalTick: 24,
    targetEntity: -1,
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
    targetEntity: -1,
    vehicle: "heavy",
  });
  // Crew touch down on day ~10 (GDD's forgiving-early rule — verified: a
  // day-4 landing dies of CO₂ before any player can stand up ECLSS).
  for (const name of CREW_NAMES) {
    world.enqueueCommand(CMD_ADD_CREW, { name, skills: { engineer: 2 }, location: -1 }, 250);
  }
  return world;
}

function livingCrewEntities(world: World): number[] {
  return [...world.store<CrewComponent>(CREW_COMPONENT).entries()]
    .filter(([, crew]) => crew.alive === 1)
    .map(([entity]) => entity);
}

function download(filename: string, text: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;

async function boot(): Promise<void> {
  const app = {
    pack: loadContentPack("base", BASE_DOCS),
    map: null as unknown as LunarMap,
    gameDef: null as unknown as WorldDef,
    host: null as unknown as SimHost,
    hud: null as unknown as Hud,
    renderer: null as unknown as MapRenderer,
    mode: "game" as "game" | "sim",
    startYear: 2026,
    buffers: new Map<string, SeriesBuffer>(OBSERVER_SERIES.map((s) => [s.key, new SeriesBuffer()])),
  };
  app.map = loadMap(app.pack.maps[0] as (typeof app.pack.maps)[number]);
  app.gameDef = createGameDef(app.pack, app.map);
  app.renderer = new MapRenderer(app.map, app.pack);
  await app.renderer.init($("#map-wrap"));
  app.host = new SimHost(makeTutorialWorld(app.pack, app.map, app.gameDef));
  app.hud = new Hud(app.pack.number("day_synodic") * 24, app.pack);
  app.hud.resync(app.host.world);

  const ui: UiState & { pediaFilter: string } = {
    tab: "roster",
    selectedBuild: null,
    flowResource: "water",
    pediaFilter: "",
  };

  // ── tabs ──
  const panels: Record<string, HTMLElement> = {
    roster: $("#roster"),
    build: $("#build-panel"),
    tech: $("#tech-panel"),
    colony: $("#colony-panel"),
    supply: $("#supply-panel"),
    flows: $("#flows-panel"),
    pedia: $("#pedia-panel"),
  };
  const tabBar = $("#tabs");
  const tabNames: [string, string, string][] = [
    ["roster", "Crew", "r"],
    ["build", "Build", "b"],
    ["tech", "Tech", "t"],
    ["colony", "Colony", "c"],
    ["supply", "Supply", "s"],
    ["flows", "Flows", "f"],
    ["pedia", "Pedia", "p"],
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
  tabBar.replaceChildren();
  for (const [name, label, key] of tabNames) {
    const button = document.createElement("button");
    button.textContent = label;
    button.title = `Shortcut: ${key.toUpperCase()}`;
    button.setAttribute("data-tab", name);
    button.addEventListener("click", () => setTab(name));
    tabBar.appendChild(button);
  }
  setTab("roster");
  handleResearchEvents(panels["tech"] as HTMLElement, () => app.host.world);
  (panels["pedia"] as HTMLElement).addEventListener("lunaris-pedia", (event) => {
    ui.pediaFilter = (event as CustomEvent).detail as string;
  });

  // ── map interaction ──
  app.renderer.app.canvas.addEventListener("click", (event) => {
    const rect = app.renderer.app.canvas.getBoundingClientRect();
    const tx = Math.floor(((event.clientX - rect.left) / rect.width) * app.map.width);
    const ty = Math.floor(((event.clientY - rect.top) / rect.height) * app.map.height);
    if (ui.selectedBuild !== null) {
      app.host.world.enqueueCommand(CMD_QUEUE_BUILD, { defId: ui.selectedBuild, x: tx, y: ty });
      ui.selectedBuild = null;
      return;
    }
    const buildings = app.host.world.store<BuildingComponent>(BUILDING_COMPONENT);
    let found: number | null = null;
    for (const [entity, building] of buildings.entries()) {
      const [w, h] = app.pack.building(building.defId).footprint;
      if (tx >= building.x && tx < building.x + w && ty >= building.y && ty < building.y + h) {
        found = entity;
      }
    }
    app.hud.select(found);
  });

  // ── controls ──
  const controls = $("#controls");
  controls.replaceChildren();
  const speedButtons = new Map<SimSpeed, HTMLButtonElement>();
  const addButton = (label: string, onClick: () => void, title = ""): HTMLButtonElement => {
    const button = document.createElement("button");
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", onClick);
    controls.appendChild(button);
    return button;
  };
  const setSpeed = (speed: SimSpeed): void => {
    app.host.speed = speed;
    app.host.pausedBy = null;
    for (const [s, b] of speedButtons) {
      b.classList.toggle("active", s === speed);
    }
  };
  speedButtons.set(
    0,
    addButton("⏸", () => setSpeed(0), "Space"),
  );
  speedButtons.set(
    1,
    addButton("▶ 1×", () => setSpeed(1), "1"),
  );
  speedButtons.set(
    10,
    addButton("▶▶ 10×", () => setSpeed(10), "2"),
  );
  speedButtons.set(
    60,
    addButton("▶▶▶ 60×", () => setSpeed(60), "3"),
  );
  speedButtons.set(
    720,
    addButton("⏩ day/min", () => setSpeed(720), "4 — one lunar day per minute"),
  );
  setSpeed(10);

  addButton("☀ SPE", () => {
    app.host.world.enqueueCommand(CMD_TRIGGER_SPE, { mSv: 300 });
  });
  addButton("Crew → shelter", () => {
    const shelters = [
      ...app.host.world.store<BuildingComponent>(BUILDING_COMPONENT).entries(),
    ].filter(([, b]) => (app.pack.building(b.defId).services.shelter ?? 0) > 0);
    if (shelters.length === 0) {
      return;
    }
    for (const entity of livingCrewEntities(app.host.world)) {
      app.host.world.enqueueCommand(CMD_ASSIGN_CREW, {
        crew: entity,
        location: (shelters[0] as [number, BuildingComponent])[0],
      });
    }
  });
  addButton("💾 Save", () => {
    download(
      `lunaris-save-t${app.host.world.tickCount}.json`,
      JSON.stringify(saveWorld(app.host.world)),
    );
  });
  const loadInput = document.createElement("input");
  loadInput.type = "file";
  loadInput.accept = ".json";
  loadInput.hidden = true;
  loadInput.addEventListener("change", () => {
    const file = loadInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void file.text().then((text) => {
      app.host.replaceWorld(loadWorld(app.gameDef, JSON.parse(text)));
      app.hud.resync(app.host.world);
    });
  });
  controls.appendChild(loadInput);
  addButton("📂 Load", () => loadInput.click());
  const modInput = document.createElement("input");
  modInput.type = "file";
  modInput.accept = ".json";
  modInput.hidden = true;
  modInput.addEventListener("change", () => {
    const file = modInput.files?.[0];
    if (file === undefined) {
      return;
    }
    void file.text().then((text) => {
      const doc = JSON.parse(text) as Record<string, unknown>;
      const modPack = loadContentPack((doc["id"] as string | undefined) ?? "mod", doc, {
        partial: true,
      });
      app.pack = mergePacks(loadContentPack("base", BASE_DOCS), modPack);
      app.map = loadMap(app.pack.maps[0] as (typeof app.pack.maps)[number]);
      app.gameDef = createGameDef(app.pack, app.map);
      app.host.replaceWorld(makeTutorialWorld(app.pack, app.map, app.gameDef));
      app.hud.resync(app.host.world);
      alert(`Mod '${modPack.id}' merged — new game started on the modded pack.`);
    });
  });
  controls.appendChild(modInput);
  addButton("🧩 Mod", () => modInput.click(), "Load a partial content-pack JSON");
  addButton(
    "A±",
    () => {
      const html = document.documentElement;
      const cur = parseFloat(getComputedStyle(html).fontSize);
      html.style.fontSize = `${cur >= 20 ? 13 : cur + 1.5}px`;
    },
    "Font size",
  );
  addButton("⌂ Menu", () => {
    $("#start-screen").hidden = false;
  });

  // ── observer dashboard ──
  const chartsRoot = $("#charts");
  chartsRoot.replaceChildren();
  const canvases = new Map<string, HTMLCanvasElement>();
  for (const series of OBSERVER_SERIES) {
    const cell = document.createElement("div");
    cell.className = "chart-cell";
    const label = document.createElement("div");
    label.className = "chart-label";
    label.style.color = series.color;
    label.textContent = series.label;
    const value = document.createElement("span");
    value.className = "chart-value";
    label.appendChild(value);
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 48;
    cell.append(label, canvas);
    chartsRoot.appendChild(cell);
    canvases.set(series.key, canvas);
  }
  const takeCommand = $("#take-command");
  takeCommand.addEventListener("click", () => {
    const enabled = takeCommand.classList.toggle("ai-off") ? 0 : 1;
    app.host.world.enqueueCommand(CMD_SET_POLICY, { enabled });
    takeCommand.textContent = enabled === 1 ? "🧑‍🚀 Take Command" : "🤖 Hand back to AI";
  });

  // ── start screen ──
  const scenarioSelect = $("#scenario-select") as HTMLSelectElement;
  scenarioSelect.replaceChildren();
  for (const scenario of app.pack.scenarios) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.name;
    scenarioSelect.appendChild(option);
  }
  const startGame = (): void => {
    app.mode = "game";
    app.host.replaceWorld(makeTutorialWorld(app.pack, app.map, app.gameDef));
    app.host.autopauseCodes = new Set();
    app.hud.resync(app.host.world);
    app.startYear = 2026;
    for (const buffer of app.buffers.values()) {
      buffer.reset();
    }
    $("#observer").hidden = true;
    $("#tutorial").hidden = false;
    $("#start-screen").hidden = true;
    setSpeed(10);
  };
  const startSim = (): void => {
    const scenario = app.pack.scenarios.find((s) => s.id === scenarioSelect.value) as Scenario;
    const failureTables = ($("#failure-select") as HTMLSelectElement).value;
    const seedRaw = ($("#seed-input") as HTMLInputElement).value.trim();
    const seed = seedRaw === "" ? scenarioSeed(scenario, SEED) : Number(seedRaw);
    const config = scenarioToConfig(scenario);
    config["failureTables"] = failureTables;
    app.mode = "sim";
    app.host.replaceWorld(createWorld(app.gameDef, { seed, config }));
    app.host.autopauseCodes = new Set(scenario.autopause);
    app.hud.resync(app.host.world);
    app.startYear = scenario.startYear;
    for (const buffer of app.buffers.values()) {
      buffer.reset();
    }
    takeCommand.classList.remove("ai-off");
    takeCommand.textContent = "🧑‍🚀 Take Command";
    $("#observer").hidden = false;
    $("#tutorial").hidden = true;
    $("#start-screen").hidden = true;
    setSpeed(720);
  };
  $("#start-game").addEventListener("click", startGame);
  $("#start-sim").addEventListener("click", startSim);

  // ── keyboard (M7 accessibility pass) ──
  window.addEventListener("keydown", (event) => {
    if ((event.target as HTMLElement).tagName === "INPUT") {
      return;
    }
    if (event.key === "Escape") {
      ui.selectedBuild = null;
    } else if (event.key === " ") {
      event.preventDefault();
      setSpeed(app.host.speed === 0 ? 10 : 0);
    } else if (event.key === "1") {
      setSpeed(1);
    } else if (event.key === "2") {
      setSpeed(10);
    } else if (event.key === "3") {
      setSpeed(60);
    } else if (event.key === "4") {
      setSpeed(720);
    } else {
      const tab = tabNames.find(([, , key]) => key === event.key.toLowerCase());
      if (tab !== undefined) {
        setTab(tab[0]);
      }
    }
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>)["__lunaris"] = {
      app,
      startSim,
      startGame,
      setSpeed,
    };
  }

  // ── frame loop ──
  const tutorialRoot = $("#tutorial");
  const resbar = $("#resbar");
  let frameCount = 0;
  const frame = (nowMs: number): void => {
    app.host.pump(nowMs);
    app.host.checkAutopause();
    if (app.host.pausedBy !== null) {
      for (const [s, b] of speedButtons) {
        b.classList.toggle("active", s === 0);
      }
    }
    const world = app.host.world;
    app.renderer.draw(world);
    app.hud.update(world);
    const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
    document.body.classList.toggle("night", env.litB === 0); // ops-at-night theme
    for (const series of OBSERVER_SERIES) {
      (app.buffers.get(series.key) as SeriesBuffer).push(world, series);
    }
    if (frameCount % 15 === 0) {
      if (app.mode === "game") {
        renderTutorial(tutorialRoot, world);
      }
      // Resource bar (UI-UX top bar: see the runway, feel the night).
      const crew = livingCrewEntities(world).length;
      const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
      const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
      const amount = (id: string): number => {
        let total = 0;
        for (const entity of world.store<BuildingComponent>(BUILDING_COMPONENT).entities()) {
          total += world.resources.amount(entity, id);
        }
        return total;
      };
      const runway = (id: string, perCrewDay: number): string =>
        crew === 0
          ? `${amount(id).toFixed(0)}kg`
          : `${(amount(id) / (crew * perCrewDay)).toFixed(0)}d`;
      const chip = (icon: string, label: string, value: string): string =>
        `<span class="chip"><span class="chip-i">${icon}</span>${label} <strong>${value}</strong></span>`;
      resbar.innerHTML =
        chip("◆", `P${phase.phase}`, `${crew} crew`) +
        chip("●", "H₂O", runway("water", 7.04)) +
        chip("○", "O₂", runway("o2-gas", 0.84)) +
        chip("✚", "Food", runway("food", 0.62)) +
        chip("🔧", "Parts", `${amount("spare-parts").toFixed(0)}kg`) +
        chip("$", "Budget", `$${(economy.balanceUsd / 1e9).toFixed(1)}B`) +
        (app.host.pausedBy !== null
          ? `<span class="chip chip-pause">⏸ auto-paused: ${app.host.pausedBy}</span>`
          : "");

      if (app.mode === "sim" && frameCount % 30 === 0) {
        for (const series of OBSERVER_SERIES) {
          const buffer = app.buffers.get(series.key) as SeriesBuffer;
          const canvas = canvases.get(series.key) as HTMLCanvasElement;
          drawSparkline(canvas, buffer.values, series.color);
          const valueEl = canvas.previousElementSibling?.querySelector(".chart-value");
          if (valueEl !== null && valueEl !== undefined && buffer.values.length > 0) {
            valueEl.textContent = ` ${series.format(buffer.values[buffer.values.length - 1] as number)}`;
          }
        }
        renderTimeline($("#timeline"), world, app.startYear);
      }
      if (ui.tab === "build") {
        renderBuildMenu(panels["build"] as HTMLElement, world, app.pack, ui, (defId) => {
          ui.selectedBuild = defId;
        });
      } else if (ui.tab === "tech") {
        renderTechPanel(panels["tech"] as HTMLElement, world, app.pack);
      } else if (ui.tab === "colony") {
        renderColonyPanel(panels["colony"] as HTMLElement, world);
      } else if (ui.tab === "supply") {
        renderSupplyPanel(panels["supply"] as HTMLElement, world, app.pack, -1);
      } else if (ui.tab === "flows") {
        renderFlows(panels["flows"] as HTMLElement, world, app.pack, ui, (resource) => {
          ui.flowResource = resource;
        });
      } else if (ui.tab === "pedia" && frameCount % 60 === 0) {
        if (!(document.activeElement instanceof HTMLInputElement)) {
          renderLunarpedia(panels["pedia"] as HTMLElement, app.pack, ui.pediaFilter);
        }
      }
    }
    frameCount++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

void boot();
