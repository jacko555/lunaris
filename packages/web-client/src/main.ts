import {
  ALERTS_COMPONENT,
  BUILDING_COMPONENT,
  findPolicyAnchors,
  CMD_ADD_CREW,
  CMD_ASSIGN_CREW,
  CMD_LAUNCH_EXPEDITION,
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
  type AlertsComponent,
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
import {
  drawClockDial,
  renderCrewDetail,
  renderTechDetail,
  renderExploration,
  renderIndustry,
  renderLogistics,
  renderNextEvent,
  renderPhaseRibbon,
  renderTopbar,
} from "./screens.js";
import { SimHost, type SimSpeed } from "./sim-host.js";
import { storage } from "./storage.js";
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

// Start-screen key art (P1) — layered under a dark gradient when present.
const KEYART_URLS = import.meta.glob("../../../assets/gen/terrain/keyart__start.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// P2 phase-milestone cards (cards/phase__<n>.png) back the phase banner.
const PHASE_CARD_URLS = import.meta.glob("../../../assets/gen/cards/phase__*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function phaseCardUrl(phase: number): string | null {
  for (const [path, url] of Object.entries(PHASE_CARD_URLS)) {
    if (path.endsWith(`/phase__${phase}.png`)) {
      return url;
    }
  }
  return null;
}

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
    // T11 dual-run compare: a shadow world (same seed, flipped failure
    // tables) runs in a Web Worker — pure compute, six numbers per game-day
    // back. Modded packs skip the compare (the worker simulates base only).
    shadowWorker: null as Worker | null,
    shadowSeries: new Map<string, number[]>(OBSERVER_SERIES.map((s) => [s.key, []])),
    packIsBase: true,
  };
  app.map = loadMap(
    app.pack.maps.find((m) => m.id === "shackleton_rim") as (typeof app.pack.maps)[number],
  );
  app.gameDef = createGameDef(app.pack, app.map);
  app.renderer = new MapRenderer(app.map, app.pack);
  await app.renderer.init($("#map-wrap"));
  app.host = new SimHost(makeTutorialWorld(app.pack, app.map, app.gameDef));
  setTimeout(() => {
    // After resizeTo has measured the real viewport (first frames lie).
    const home = findBuildSite(app.map, 12, 8);
    app.renderer.frame(home.x + 6, home.y + 4);
  }, 200);
  const TPLD = app.pack.number("day_synodic") * 24;
  app.hud = new Hud(TPLD, app.pack);
  app.hud.resync(app.host.world);

  const keyart = Object.values(KEYART_URLS)[0];
  if (keyart !== undefined) {
    $("#start-screen").style.background =
      `linear-gradient(rgba(4,6,10,0.82), rgba(4,6,10,0.93)), url(${JSON.stringify(keyart)}) center/cover no-repeat`;
  }

  const ui: UiState & {
    pediaFilter: string;
    planRover: number | null;
    selectedCrew: number | null;
    selectedTech: string | null;
  } = {
    tab: "roster",
    selectedBuild: null,
    flowResource: "water",
    pediaFilter: "",
    planRover: null as number | null,
    selectedCrew: null as number | null,
    selectedTech: null as string | null,
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
  // ── Mission Ops rail: screens in the workspace, contextual detail aside ──
  const rail = $("#rail");
  const SCREENS: [string, string, string, string][] = [
    // [screen key, icon, label, shortcut]
    ["map", "🗺", "MAP", "m"],
    ["crew", "👥", "CREW", "r"],
    ["research", "🧪", "RESEARCH", "t"],
    ["industry", "🏭", "INDUSTRY", "i"],
    ["logistics", "🚀", "LOGISTICS", "l"],
    ["exploration", "🛰", "EXPLORE", "x"],
    ["colony", "🏛", "COLONY", "c"],
    ["pedia", "📖", "PEDIA", "p"],
    ["observer", "📊", "OBSERVER", "o"],
  ];
  const DETAIL_FOR: Record<string, string> = {
    map: "detail-map",
    logistics: "detail-supply",
    industry: "detail-flows",
    crew: "detail-crew",
    research: "detail-tech",
  };
  const setScreen = (screen: string): void => {
    ui.tab = screen;
    for (const [key] of SCREENS) {
      const section = document.querySelector(`#screen-${key}`) as HTMLElement;
      section.hidden = key !== screen;
    }
    const detailId = DETAIL_FOR[screen] ?? "detail-map";
    for (const id of [
      "detail-map",
      "detail-supply",
      "detail-flows",
      "detail-crew",
      "detail-tech",
    ]) {
      $(`#${id}`).hidden = id !== detailId;
    }
    for (const button of rail.children) {
      button.classList.toggle("active", button.getAttribute("data-screen") === screen);
    }
  };
  rail.replaceChildren();
  for (const [key, icon, label, shortcut] of SCREENS) {
    const button = document.createElement("button");
    button.innerHTML = `<span class="ico">${icon}</span>${label}`;
    button.title = `Shortcut: ${shortcut.toUpperCase()}`;
    button.setAttribute("data-screen", key);
    button.addEventListener("click", () => setScreen(key));
    rail.appendChild(button);
  }
  const observerRail = rail.lastElementChild as HTMLElement;
  setScreen("map");
  handleResearchEvents(panels["tech"] as HTMLElement, () => app.host.world);
  (panels["pedia"] as HTMLElement).addEventListener("lunaris-pedia", (event) => {
    ui.pediaFilter = (event as CustomEvent).detail as string;
  });

  // ── map interaction (rebound after every renderer rebuild) ──
  const bindMapInteraction = (): void => {
    app.renderer.app.canvas.addEventListener("click", (event) => {
      if (app.renderer.wasDrag) {
        return; // camera pan, not a selection
      }
      const { x: tx, y: ty } = app.renderer.tileAtClient(event.clientX, event.clientY);
      if (tx < 0 || ty < 0 || tx >= app.map.width || ty >= app.map.height) {
        return;
      }
      if (ui.planRover !== null) {
        app.host.world.enqueueCommand(CMD_LAUNCH_EXPEDITION, { rover: ui.planRover, x: tx, y: ty });
        ui.planRover = null;
        setScreen("exploration");
        return;
      }
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
      app.renderer.selected = found; // W4 selection ring
    });
  };
  bindMapInteraction();

  // W3 overlay toggle chips (state lives on the renderer instance).
  const renderOverlayChips = (): void => {
    const chips = $("#overlay-chips");
    chips.replaceChildren();
    for (const key of ["illum", "network", "radius", "badges"] as const) {
      const button = document.createElement("button");
      button.textContent = key.toUpperCase();
      button.classList.toggle("active", app.renderer.overlays[key]);
      button.addEventListener("click", () => {
        app.renderer.overlays[key] = !app.renderer.overlays[key];
        renderOverlayChips();
      });
      chips.appendChild(button);
    }
  };
  renderOverlayChips();

  // Tech rows select a technology for the detail aside.
  $("#tech-panel").addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest(".tech-row") as HTMLElement | null;
    if (row !== null && row.dataset["tech"] !== undefined) {
      ui.selectedTech = row.dataset["tech"] as string;
    }
  });

  // Roster clicks select a crew member for the detail aside.
  $("#roster").addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest(".crew-row") as HTMLElement | null;
    if (row !== null && row.dataset["entity"] !== undefined) {
      ui.selectedCrew = Number(row.dataset["entity"]);
    }
  });

  /** Swap the active site: rebuild the renderer + game def for a new map. */
  const setSite = async (mapId: string): Promise<void> => {
    if (app.map.id === mapId) {
      return;
    }
    const mapDoc = app.pack.maps.find((m) => m.id === mapId);
    if (mapDoc === undefined) {
      return; // scenario references a map this pack lacks — keep current
    }
    app.map = loadMap(mapDoc);
    app.gameDef = createGameDef(app.pack, app.map);
    app.renderer.app.destroy(true, { children: true, texture: false });
    $("#map-wrap").querySelector("canvas")?.remove();
    app.renderer = new MapRenderer(app.map, app.pack);
    await app.renderer.init($("#map-wrap"));
    bindMapInteraction();
  };

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
      app.packIsBase = false;
      app.pack = mergePacks(loadContentPack("base", BASE_DOCS), modPack);
      app.map = loadMap(
        app.pack.maps.find((m) => m.id === "shackleton_rim") as (typeof app.pack.maps)[number],
      );
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
  $("#gameover-menu").addEventListener("click", () => {
    $("#gameover").hidden = true;
    $("#start-screen").hidden = false;
  });
  const startGame = (): void => {
    void (async () => {
      await setSite("shackleton_rim");
      gameOverShown = false;
      app.mode = "game";
      app.shadowWorker?.terminate();
      app.shadowWorker = null;
      app.host.replaceWorld(makeTutorialWorld(app.pack, app.map, app.gameDef));
      app.host.autopauseCodes = new Set();
      app.hud.resync(app.host.world);
      app.startYear = 2026;
      for (const buffer of app.buffers.values()) {
        buffer.reset();
      }
      observerRail.style.display = "none";
      setScreen("map");
      {
        const home = findBuildSite(app.map, 12, 8);
        app.renderer.frame(home.x + 6, home.y + 4);
      }
      $("#tutorial").hidden = false;
      ($("#build-box") as HTMLDetailsElement).open = true;
      $("#start-screen").hidden = true;
      setSpeed(10);
    })();
  };
  const startSim = (): void => {
    void (async () => {
      const scenario = app.pack.scenarios.find((s) => s.id === scenarioSelect.value) as Scenario;
      await setSite(scenario.site);
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
      const shadowConfig = scenarioToConfig(scenario);
      const shadowTables = failureTables === "realistic" ? "ideal" : "realistic";
      shadowConfig["failureTables"] = shadowTables;
      app.shadowWorker?.terminate();
      app.shadowWorker = null;
      for (const arr of app.shadowSeries.values()) {
        arr.length = 0;
      }
      if (app.packIsBase) {
        const worker = new Worker(new URL("./shadow-worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as { rows: { key: string; value: number }[] };
          for (const row of data.rows) {
            app.shadowSeries.get(row.key)?.push(row.value);
          }
        };
        worker.postMessage({ type: "init", seed, config: shadowConfig });
        app.shadowWorker = worker;
      }
      $("#compare-legend").textContent = app.packIsBase
        ? `— ${failureTables} · ┄ ${shadowTables} (same seed, worker)`
        : "compare unavailable on modded packs";
      for (const buffer of app.buffers.values()) {
        buffer.reset();
      }

      takeCommand.classList.remove("ai-off");
      takeCommand.textContent = "🧑‍🚀 Take Command";
      observerRail.style.display = "";
      {
        const anchors = findPolicyAnchors(app.map);
        app.renderer.frame(anchors.baseX, anchors.baseY);
      }
      setScreen("observer");
      $("#tutorial").hidden = true;
      $("#start-screen").hidden = true;
      setSpeed(720);
    })();
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
      ui.planRover = null;
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
    } else if (event.key.toLowerCase() === "b") {
      setScreen("map");
      ($("#build-box") as HTMLDetailsElement).open = true;
    } else {
      const entry = SCREENS.find(([, , , shortcut]) => shortcut === event.key.toLowerCase());
      if (entry !== undefined && !(entry[0] === "observer" && app.mode === "game")) {
        setScreen(entry[0]);
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
  let lastAutosaveTick = 0;
  let gameOverShown = false;
  let runReportShown = false;
  let lastPhaseSeen = -1;
  const showPhaseBanner = (phase: number, name: string): void => {
    const banner = $("#phase-banner");
    const card = phaseCardUrl(phase);
    banner.innerHTML = `${card !== null ? `<img src="${card}" alt="" style="display:block;width:340px;max-width:60vw;border-radius:8px;margin:0 auto 8px"/>` : ""}<h2>PHASE ${phase} — ${name}</h2><div class="sub">milestone logged in the chronicle</div>`;
    banner.hidden = false;
    setTimeout(() => {
      banner.hidden = true;
    }, 6000);
  };
  const frame = (nowMs: number): void => {
    app.host.pump(nowMs);
    app.host.checkAutopause();
    if (app.host.pausedBy !== null) {
      for (const [s, b] of speedButtons) {
        b.classList.toggle("active", s === 0);
      }
    }
    const world = app.host.world;
    if (ui.tab === "map") {
      app.renderer.draw(world); // skip Pixi work while another screen is up
    }
    app.hud.update(world);
    const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
    document.body.classList.toggle("night", env.litB === 0); // ops-at-night theme
    for (const series of OBSERVER_SERIES) {
      (app.buffers.get(series.key) as SeriesBuffer).push(world, series);
    }
    if (app.shadowWorker !== null && frameCount % 30 === 0) {
      app.shadowWorker.postMessage({ type: "advance", toTick: world.tickCount });
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
          const shadowValues = app.shadowSeries.get(series.key) as number[];
          drawSparkline(
            canvas,
            buffer.values,
            series.color,
            app.shadowWorker !== null ? shadowValues : [],
          );
          const valueEl = canvas.previousElementSibling?.querySelector(".chart-value");
          if (valueEl !== null && valueEl !== undefined && buffer.values.length > 0) {
            valueEl.textContent = ` ${series.format(buffer.values[buffer.values.length - 1] as number)}`;
          }
        }
        renderTimeline($("#timeline"), world, app.startYear);
      }
      // Autosave each game-day (storage adapter: localStorage only in the
      // deployed build; in-memory elsewhere per CLAUDE.md).
      if (world.tickCount - lastAutosaveTick >= 24) {
        lastAutosaveTick = world.tickCount;
        storage.save(
          "autosave",
          {
            mode: app.mode,
            startYear: app.startYear,
            tick: world.tickCount,
            savedLabel: app.mode + " · day " + Math.floor(world.tickCount / 24),
          },
          saveWorld(world),
        );
      }

      // Run report: the scenario horizon is the finish line (MODES.md) —
      // pause and grade the program against its shadow run.
      if (app.mode === "sim" && !runReportShown) {
        const horizon = (world.config as Record<string, unknown> | null)?.["horizonTicks"] as
          | number
          | undefined;
        if (horizon !== undefined && world.tickCount >= horizon) {
          runReportShown = true;
          app.host.speed = 0;
          const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
          const final = (key: string): string => {
            const series = OBSERVER_SERIES.find((s) => s.key === key);
            const main = series !== undefined ? series.format(series.sample(world)) : "—";
            const shadowArr = app.shadowSeries.get(key);
            const shadowLast =
              shadowArr !== undefined && shadowArr.length > 0
                ? (series?.format(shadowArr[shadowArr.length - 1] as number) ?? "—")
                : "—";
            return `<td>${main}</td><td>${shadowLast}</td>`;
          };
          const rows = OBSERVER_SERIES.map(
            (s) => `<tr><td>${s.label}</td>${final(s.key)}</tr>`,
          ).join("");
          const milestoneLines = phase.milestones
            .map(
              (m) =>
                `<div class="tl-row"><span>${(app.startYear + m.tick / 8766).toFixed(1)}</span><span>${m.id}</span></div>`,
            )
            .join("");
          $("#runreport-body").innerHTML =
            `<div class="panel-hint">${Math.round((world.tickCount / 8766) * 10) / 10} years simulated · final phase ${phase.phase}</div>` +
            `<table class="rr-table"><tr><th>metric</th><th>this run</th><th>shadow</th></tr>${rows}</table>` +
            `<div style="max-height:160px;overflow-y:auto;margin-top:10px">${milestoneLines}</div>`;
          $("#runreport").hidden = false;
        }
      }

      // Outcome presentation: phase fanfare + the mission-lost screen.
      const phaseNow = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY).phase;
      if (lastPhaseSeen >= 0 && phaseNow > lastPhaseSeen) {
        const names = [
          "ROBOTIC PRECURSORS",
          "CREWED SORTIES",
          "OUTPOST",
          "PERMANENT BASE",
          "SETTLEMENT",
          "INDUSTRIAL EXPORT",
          "LUNAR CITY",
        ];
        showPhaseBanner(phaseNow, names[phaseNow] ?? "");
      }
      lastPhaseSeen = phaseNow;
      if (app.mode === "game" && !gameOverShown) {
        const crews = [...world.store<CrewComponent>(CREW_COMPONENT).entries()];
        if (crews.length > 0 && crews.every(([, c]) => c.alive !== 1)) {
          gameOverShown = true;
          app.host.speed = 0;
          const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries;
          const lastCritical = [...alerts].reverse().find((a) => a.severity === "critical");
          const milestones = world
            .store<PhaseComponent>(PHASE_COMPONENT)
            .require(COLONY_ENTITY).milestones;
          $("#gameover-stats").innerHTML =
            `<div class="kv"><span>Survived</span><span>${Math.floor(world.tickCount / 24)} days (${(world.tickCount / TPLD).toFixed(1)} lunar days)</span></div>` +
            `<div class="kv"><span>Crew lost</span><span>${crews.length}</span></div>` +
            `<div class="kv"><span>Buildings standing</span><span>${world.store(BUILDING_COMPONENT).size}</span></div>` +
            `<div class="kv"><span>Milestones</span><span>${milestones.map((m) => m.id).join(", ") || "none"}</span></div>` +
            `<div class="panel-hint" style="margin-top:10px">${lastCritical !== undefined ? `Final alert: ${lastCritical.message}` : ""}</div>` +
            `<div class="panel-hint">The Moon does not forgive missing redundancy. Check the chronicle, then fly again.</div>`;
          $("#gameover").hidden = false;
        }
      }

      // Mission Ops chrome: top-bar stats, clock dial, next-event card.
      renderTopbar(world);
      drawClockDial($("#clock-dial") as HTMLCanvasElement, world, TPLD);
      renderNextEvent($("#next-event"), world, TPLD);
      const lastAlert = world.store<AlertsComponent>(ALERTS_COMPONENT).require(3).entries.at(-1);
      const ticker = $("#alert-ticker");
      if (lastAlert !== undefined) {
        ticker.textContent = `t${lastAlert.tick} · ${lastAlert.message}`;
        ticker.className = lastAlert.severity;
      }

      if (ui.tab === "map") {
        renderBuildMenu(panels["build"] as HTMLElement, world, app.pack, ui, (defId) => {
          ui.selectedBuild = defId;
        });
      } else if (ui.tab === "research") {
        renderTechPanel(panels["tech"] as HTMLElement, world, app.pack);
        renderPhaseRibbon($("#phase-ribbon"), world);
        if (ui.selectedTech !== null) {
          renderTechDetail($("#tech-detail"), world, app.pack, ui.selectedTech, (techId) => {
            app.host.world.enqueueCommand("cmd-start-research", { techId });
          });
        }
      } else if (ui.tab === "industry") {
        renderIndustry($("#industry"), world, app.pack);
        renderFlows(panels["flows"] as HTMLElement, world, app.pack, ui, (resource) => {
          ui.flowResource = resource;
        });
      } else if (ui.tab === "logistics") {
        renderLogistics($("#logistics"), world, app.pack);
        renderSupplyPanel(panels["supply"] as HTMLElement, world, app.pack, -1);
      } else if (ui.tab === "crew" && ui.selectedCrew !== null) {
        renderCrewDetail($("#crew-detail"), world, app.pack, ui.selectedCrew, (crew, location) => {
          app.host.world.enqueueCommand(CMD_ASSIGN_CREW, { crew, location });
        });
      } else if (ui.tab === "exploration") {
        renderExploration($("#exploration"), world, app.pack, ui.planRover, (rover) => {
          ui.planRover = rover;
          setScreen("map");
        });
      } else if (ui.tab === "colony") {
        renderColonyPanel(panels["colony"] as HTMLElement, world);
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
