import {
  ALERTS_COMPONENT,
  ALERTS_ENTITY,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  GRID_COMPONENT,
  GRID_ENTITY,
  type AlertsComponent,
  type EnvironmentComponent,
  type GridComponent,
  type World,
} from "@lunaris/sim-core";

/** HUD v0: lunar clock, power bar (gen/use/stored), alert toasts. */
export class Hud {
  private clockBig = document.querySelector("#clock .big") as HTMLElement;
  private clockSub = document.querySelector("#clock .sub") as HTMLElement;
  private powerLine = document.querySelector("#power-line") as HTMLElement;
  private storageLine = document.querySelector("#storage-line") as HTMLElement;
  private genBar = document.querySelector("#powerbar .gen") as HTMLElement;
  private unmetBar = document.querySelector("#powerbar .unmet") as HTMLElement;
  private storedBar = document.querySelector("#storagebar .stored") as HTMLElement;
  private toasts = document.querySelector("#toasts") as HTMLElement;
  private lastAlertSeq = -1;
  private readonly ticksPerLunarDay: number;

  constructor(ticksPerLunarDay: number) {
    this.ticksPerLunarDay = ticksPerLunarDay;
  }

  /** Forget already-shown alerts (after a world reset). */
  resync(world: World): void {
    const alerts = world.store<AlertsComponent>(ALERTS_COMPONENT).require(ALERTS_ENTITY);
    this.lastAlertSeq = alerts.seq - 1;
    this.toasts.replaceChildren();
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
    }
  }
}

function formatHours(hours: number): string {
  if (hours < 48) {
    return `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}
