import {
  ALERTS_COMPONENT,
  ALERTS_ENTITY,
  BUILDING_COMPONENT,
  CREW_COMPONENT,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  GRID_ENTITY,
  THERMAL_COMPONENT,
  type AlertsComponent,
  type BuildingComponent,
  type ContentPack,
  type CrewComponent,
  type EnvironmentComponent,
  type GridComponent,
  type ResourceStoreData,
  type ThermalComponent,
  type World,
} from "@lunaris/sim-core";

// P2 chronicle card art (cards/event__<eventId>.png); rows stay text-only
// until the art lands.
const CARD_URLS = import.meta.glob("../../../assets/gen/cards/event__*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function eventCardUrl(alertCode: string): string | null {
  const eventId = alertCode.replace(/-warning$/, "");
  for (const [path, url] of Object.entries(CARD_URLS)) {
    if (path.endsWith(`/event__${eventId}.png`)) {
      return url;
    }
  }
  return null;
}

/** HUD: lunar clock, power bars, alert toasts + queue, crew roster, inspector. */
export class Hud {
  private clockBig = document.querySelector("#clock .big") as HTMLElement;
  private clockSub = document.querySelector("#clock .sub") as HTMLElement;
  private powerLine = document.querySelector("#power-line") as HTMLElement;
  private storageLine = document.querySelector("#storage-line") as HTMLElement;
  private genBar = document.querySelector("#powerbar .gen") as HTMLElement;
  private unmetBar = document.querySelector("#powerbar .unmet") as HTMLElement;
  private storedBar = document.querySelector("#storagebar .stored") as HTMLElement;
  private toasts = document.querySelector("#toasts") as HTMLElement;
  private roster = document.querySelector("#roster") as HTMLElement;
  private inspector = document.querySelector("#inspector") as HTMLElement;
  private alertLog = document.querySelector("#alertlog") as HTMLElement;
  private lastAlertSeq = -1;
  private selectedEntity: number | null = null;
  private readonly ticksPerLunarDay: number;
  private readonly pack: ContentPack;

  constructor(ticksPerLunarDay: number, pack: ContentPack) {
    this.ticksPerLunarDay = ticksPerLunarDay;
    this.pack = pack;
  }

  /** Inspector target (set from map clicks); null clears. */
  select(entity: number | null): void {
    this.selectedEntity = entity;
  }

  /** Forget already-shown alerts (after a world reset). */
  resync(world: World): void {
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(ALERTS_ENTITY);
    this.lastAlertSeq = alerts.seq - 1;
    this.toasts.replaceChildren();
    this.alertLog.replaceChildren();
    this.roster.innerHTML = `<em style="color: var(--dim)">No crew on site</em>`;
    this.inspector.innerHTML = `<em style="color: var(--dim)">Click a building</em>`;
    this.selectedEntity = null;
  }

  update(world: World): void {
    const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
    const grid = world.store<GridComponent>(GRID_COMPONENT).require(GRID_ENTITY);

    // ── lunar clock ──
    const dayNumber = Math.floor(world.tickCount / this.ticksPerLunarDay) + 1;
    const hourOfDay = Math.floor(world.tickCount % this.ticksPerLunarDay);
    const isNight = env.isNight === 1;
    const phaseLeft = isNight ? 1 - env.lunarPhase : 0.5 - env.lunarPhase;
    const hoursToFlip = Math.max(0, Math.round(phaseLeft * this.ticksPerLunarDay));
    this.clockBig.textContent = `${isNight ? "🌑 NIGHT" : "☀ DAY"} — lunar day ${dayNumber}, hour ${hourOfDay}/${Math.round(this.ticksPerLunarDay)}`;
    this.clockSub.textContent = `${isNight ? "Sunrise" : "Night falls"} in ${formatHours(hoursToFlip)} · surface ${env.tempSurfaceK.toFixed(0)} K`;

    // ── power bar ──
    const gen = grid.generationKw;
    const demand = grid.demandKw;
    const scale = Math.max(gen, demand, 1);
    this.powerLine.textContent = `⚡ ${gen.toFixed(1)} kW gen · ${demand.toFixed(1)} kW demand${grid.unmetKw > 0.001 ? ` · ${grid.unmetKw.toFixed(1)} kW UNMET` : ""}`;
    this.powerLine.style.color = grid.unmetKw > 0.001 ? "var(--crit)" : "";
    this.genBar.style.width = `${(Math.min(gen, demand) / scale) * 100}%`;
    this.unmetBar.style.width = `${(grid.unmetKw / scale) * 100}%`;
    const storedFrac = grid.storageCapacityKwh > 0 ? grid.storedKwh / grid.storageCapacityKwh : 0;
    this.storedBar.style.width = `${storedFrac * 100}%`;
    this.storageLine.textContent = `🔋 ${grid.storedKwh.toFixed(0)} / ${grid.storageCapacityKwh.toFixed(0)} kWh stored${grid.dischargeKw > 0.001 ? " (discharging)" : grid.chargeKw > 0.001 ? " (charging)" : ""}`;

    // ── alert toasts ──
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(ALERTS_ENTITY);
    for (const entry of alerts.entries) {
      if (entry.seq <= this.lastAlertSeq) {
        continue;
      }
      this.lastAlertSeq = entry.seq;
      const toast = document.createElement("div");
      toast.className = `toast ${entry.severity}`;
      const stamp = document.createElement("div");
      stamp.className = "t";
      stamp.textContent = `tick ${entry.tick} · ${entry.code}`;
      const body = document.createElement("div");
      body.textContent = entry.message;
      toast.append(stamp, body);
      this.toasts.appendChild(toast);
      setTimeout(() => toast.remove(), 8000);
      while (this.toasts.children.length > 5) {
        this.toasts.firstElementChild?.remove();
      }

      // Persistent alert queue (newest first) with the cause text.
      const row = document.createElement("div");
      row.className = `al ${entry.severity}`;
      const tick = document.createElement("span");
      tick.className = "t";
      tick.textContent = `t${entry.tick}`;
      if (entry.causedBy !== undefined) {
        // T12 cause chain: indent under the forecast that predicted it.
        row.style.paddingLeft = "18px";
        tick.textContent = `↳ t${entry.tick}`;
        row.title = `caused by alert #${entry.causedBy}`;
      }
      const card = eventCardUrl(entry.code);
      if (card !== null) {
        const img = document.createElement("img");
        img.src = card;
        img.className = "al-card";
        img.alt = "";
        row.appendChild(img);
      }
      row.append(tick, document.createTextNode(entry.message));
      this.alertLog.prepend(row);
      while (this.alertLog.children.length > 60) {
        this.alertLog.lastElementChild?.remove();
      }
    }

    this.renderRoster(world);
    this.renderInspector(world);
  }

  private renderRoster(world: World): void {
    const crews = world.store<CrewComponent>(CREW_COMPONENT);
    if (crews.size === 0) {
      return;
    }
    const rows: HTMLElement[] = [];
    for (const [entity, crew] of crews.entries()) {
      const row = document.createElement("div");
      row.className = "crew-row";
      row.dataset["entity"] = String(entity);
      row.style.cursor = "pointer";
      const dose30 = crew.dose30d.reduce((sum, d) => sum + d, 0);
      const status =
        crew.alive !== 1
          ? "✝ deceased"
          : crew.hypoxiaHours > 0
            ? "suffocating!"
            : crew.thirstHours > 24
              ? "dehydrated"
              : crew.hungerHours > 24
                ? "starving"
                : crew.hungerHours > 0
                  ? "hungry"
                  : crew.radiationSick === 1
                    ? "radiation sick"
                    : crew.eva === 1
                      ? "on EVA"
                      : "nominal";
      const name = document.createElement("div");
      name.className = "nm";
      name.innerHTML = `<span${crew.alive !== 1 ? ' class="dead"' : ""}>${crew.name}</span><span style="color:var(--dim)">${status}</span>`;
      row.appendChild(name);
      if (crew.alive === 1) {
        row.insertAdjacentHTML(
          "beforeend",
          `<div class="bar"><div class="hp" style="width:${crew.health}%"></div></div>
           <div class="bar"><div class="mo" style="width:${crew.morale}%"></div></div>
           <div class="bar"><div class="dose" style="width:${Math.min(100, (dose30 / 250) * 100)}%"></div></div>
           <div class="bar-label"><span>HP ${crew.health.toFixed(0)} · MOR ${crew.morale.toFixed(0)}</span><span>30d ${dose30.toFixed(1)} mSv · career ${crew.doseCareerMSv.toFixed(0)}</span></div>`,
        );
      }
      rows.push(row);
    }
    this.roster.replaceChildren(...rows);
  }

  private renderInspector(world: World): void {
    const entity = this.selectedEntity;
    if (entity === null) {
      return;
    }
    const building = world.store<BuildingComponent>(BUILDING_COMPONENT).get(entity);
    if (building === undefined) {
      this.inspector.innerHTML = `<em style="color: var(--dim)">Click a building</em>`;
      return;
    }
    const def = this.pack.building(building.defId);
    const thermal = world.store<ThermalComponent>(THERMAL_COMPONENT).get(entity);
    const store = world.store<ResourceStoreData>("resources").get(entity);
    const kv = (key: string, value: string): string =>
      `<div class="kv"><span>${key}</span><span>${value}</span></div>`;
    let html = `<strong>${def.name}</strong> <span style="color:var(--dim)">#${entity}</span>`;
    html += kv("State", thermal ? thermal.state.toUpperCase() : "passive");
    html += kv("Condition", `${(building.condition * 100).toFixed(0)}%`);
    html += kv(
      "Power",
      `${def.powerKw >= 0 ? "+" : ""}${def.powerKw} kW · ${(building.poweredFraction * 100).toFixed(0)}% supplied`,
    );
    if (thermal) {
      html += kv("Internal temp", `${thermal.tempK.toFixed(1)} K`);
      if (thermal.heaterDeliveredKw > 0.001) {
        html += kv("Heater", `${thermal.heaterDeliveredKw.toFixed(2)} kW`);
      }
    }
    if (def.shieldingGcm2 > 0) {
      html += kv("Shielding", `${def.shieldingGcm2} g/cm²`);
    }
    html += kv("Mass", `${(def.massKg / 1000).toFixed(1)} t`);
    if (def.priorityTier !== null) {
      html += kv(
        "Priority tier",
        `${def.priorityTier} ${def.priorityTier === 1 ? "(critical)" : ""}`,
      );
    }
    if (def.wearRatePerYear > 0) {
      html += kv("Wear", `${(def.wearRatePerYear * 100).toFixed(0)}% / year`);
    }
    const services = Object.entries(def.services);
    if (services.length > 0) {
      html += kv("Services", services.map(([k, v]) => `${k} ${v}`).join(", "));
    }
    // I/O per day at current duty (mockup v2 detail panel): reaction
    // stoichiometry × the building's rated primary-output throughput.
    const duty = building.poweredFraction * building.condition;
    const ioLines: string[] = [];
    if (def.mining !== undefined) {
      ioLines.push(`+ ${(def.mining.kgPerDay * duty).toFixed(0)} kg/d excavated`);
    }
    for (const rid of def.reactions) {
      const reaction = this.pack.reaction(rid);
      const rated = (def.reactionKgPerDay[rid] ?? 0) * duty;
      const primary = reaction.outputs.find((o) => o.resource === reaction.primaryOutput);
      const batches = primary !== undefined && primary.kg > 0 ? rated / primary.kg : 0;
      for (const input of reaction.inputs) {
        ioLines.push(`− ${(input.kg * batches).toFixed(1)} kg/d ${input.resource}`);
      }
      for (const output of reaction.outputs) {
        ioLines.push(`+ ${(output.kg * batches).toFixed(1)} kg/d ${output.resource}`);
      }
    }
    if (ioLines.length > 0) {
      html += `<div class="kv" style="margin-top:4px"><span>I/O per day</span><span></span></div>`;
      for (const line of ioLines) {
        html += `<div class="kv"><span style="color:${line.startsWith("+") ? "var(--good)" : "var(--crit)"}">${line}</span><span></span></div>`;
      }
    }
    if (store !== undefined && Object.keys(store.amounts).length > 0) {
      html += `<div class="kv" style="margin-top:4px"><span>Stores</span><span></span></div>`;
      for (const [resource, kg] of Object.entries(store.amounts)) {
        html += kv(`· ${resource}`, `${kg.toFixed(1)} kg`);
      }
    }
    this.inspector.innerHTML = html;
  }
}

function formatHours(hours: number): string {
  if (hours < 48) {
    return `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
