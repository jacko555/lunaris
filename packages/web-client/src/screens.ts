import {
  BUILDING_COMPONENT,
  CMD_ORDER_ROVER,
  CMD_RECALL_ROVER,
  ROVER_COMPONENT,
  roverSpec,
  type RoverComponent,
  COLONY_ENTITY,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  ENV_ENTITY,
  ENVIRONMENT_COMPONENT,
  PENDING_HAZARD_COMPONENT,
  PHASE_COMPONENT,
  RESUPPLY_COMPONENT,
  vehicleClass,
  type BuildingComponent,
  type ContentPack,
  type CrewComponent,
  type EconomyComponent,
  type EnvironmentComponent,
  type PendingHazardComponent,
  type PhaseComponent,
  type ResupplyComponent,
  type World,
} from "@lunaris/sim-core";

/** Mission Ops screens (Tier 1+2): top-bar stats, clock dial, phase ribbon,
 * logistics, production chain. All read live sim state — no assets needed. */

const PHASE_NAMES = [
  "ROBOTIC",
  "SORTIES",
  "OUTPOST",
  "PERMANENT BASE",
  "SETTLEMENT",
  "EXPORT",
  "LUNAR CITY",
];

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;

// ── top bar: funds/population with per-day deltas, phase pips ──

const dayStats = { day: -1, funds: 0, pop: 0, fundsDelta: 0, popDelta: 0 };

export function renderTopbar(world: World): void {
  const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
  const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
  let pop = 0;
  for (const [, crew] of world.store<CrewComponent>(CREW_COMPONENT).entries()) {
    if (crew.alive === 1) {
      pop++;
    }
  }
  const day = Math.floor(world.tickCount / 24);
  if (day !== dayStats.day) {
    if (dayStats.day >= 0 && day === dayStats.day + 1) {
      dayStats.fundsDelta = economy.balanceUsd - dayStats.funds;
      dayStats.popDelta = pop - dayStats.pop;
    } else if (day < dayStats.day) {
      dayStats.fundsDelta = 0;
      dayStats.popDelta = 0;
    }
    dayStats.day = day;
    dayStats.funds = economy.balanceUsd;
    dayStats.pop = pop;
  }
  $("#funds-big").textContent = `$${fmtUsd(economy.balanceUsd)}`;
  const fd = dayStats.fundsDelta;
  const fundsSub = $("#funds-sub");
  fundsSub.textContent = fd === 0 ? "" : `${fd > 0 ? "+" : "−"} $${fmtUsd(Math.abs(fd))} / day`;
  fundsSub.className = `sub ${fd >= 0 ? "delta-up" : "delta-down"}`;
  $("#pop-big").textContent = `${pop}`;
  const pd = dayStats.popDelta;
  const popSub = $("#pop-sub");
  popSub.textContent = pd === 0 ? "" : `${pd > 0 ? "+" : ""}${pd} / day`;
  popSub.className = `sub ${pd >= 0 ? "delta-up" : "delta-down"}`;
  $("#phase-big").textContent = `${phase.phase} · ${PHASE_NAMES[phase.phase] ?? ""}`;
  const pips = $("#phase-pips");
  if (pips.children.length !== 7) {
    pips.replaceChildren(...Array.from({ length: 7 }, () => document.createElement("span")));
  }
  for (let i = 0; i < 7; i++) {
    (pips.children[i] as HTMLElement).classList.toggle("on", i <= phase.phase);
  }
}

function fmtUsd(usd: number): string {
  if (usd >= 1e9) {
    return `${(usd / 1e9).toFixed(2)}B`;
  }
  if (usd >= 1e6) {
    return `${(usd / 1e6).toFixed(1)}M`;
  }
  return `${(usd / 1e3).toFixed(0)}k`;
}

// ── lunar-cycle clock dial: 24-segment ring, night arc, synodic needle ──

export function drawClockDial(canvas: HTMLCanvasElement, world: World, tpld: number): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
  const w = canvas.width;
  const c = w / 2;
  const r = w / 2 - 8;
  ctx.clearRect(0, 0, w, w);
  const css = getComputedStyle(document.body);
  const dim = css.getPropertyValue("--line").trim() || "#1f2738";
  const amber = css.getPropertyValue("--amber").trim() || "#f2a65a";
  // Night arc: class-B sites are lit for the first half of the synodic day
  // (EnvironmentSystem), so the back half of the ring is the night.
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.strokeStyle = dim;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + Math.PI); // day half
  ctx.strokeStyle = amber;
  ctx.lineWidth = 6;
  ctx.stroke();
  // Ticks each "lunar hour" (1/24 synodic).
  ctx.strokeStyle = "rgba(122,132,153,0.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (r - 6), c + Math.sin(a) * (r - 6));
    ctx.lineTo(c + Math.cos(a) * (r - 11), c + Math.sin(a) * (r - 11));
    ctx.stroke();
  }
  // Needle at the current synodic phase.
  const a = env.lunarPhase * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(a) * (r - 13), c + Math.sin(a) * (r - 13));
  ctx.strokeStyle = env.isNight === 1 ? "#e8a87c" : "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 3, 0, Math.PI * 2);
  ctx.fillStyle = env.isNight === 1 ? "#e8a87c" : "#e2e8f0";
  ctx.fill();
  // Day-of-cycle in the lower half.
  ctx.fillStyle = "rgba(122,132,153,0.9)";
  ctx.font = `${Math.round(w * 0.13)}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText(`${((world.tickCount % tpld) / 24).toFixed(1)}d`, c, c + r * 0.55);
}

// ── phase gates & milestones ribbon (research screen, mockup v2) ──

export function renderPhaseRibbon(root: HTMLElement, world: World): void {
  const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cls = i < phase.phase ? "done" : i === phase.phase ? "current" : "";
    parts.push(
      `<div class="pr-node ${cls}"><div class="dot">${i < phase.phase ? "✓" : i}</div>${PHASE_NAMES[i]}</div>`,
    );
    if (i < 6) {
      parts.push(`<div class="pr-line ${i < phase.phase ? "done" : ""}"></div>`);
    }
  }
  root.innerHTML = parts.join("");
}

// ── logistics: mission gantt + route strip + vehicle table ──

export function renderLogistics(root: HTMLElement, world: World, pack: ContentPack): void {
  const now = world.tickCount;
  const windowTicks = 24 * 30;
  let html = `<h4 style="color:var(--amber)">MISSIONS IN FLIGHT — next 30 days</h4>`;
  const missions = [...world.store<ResupplyComponent>(RESUPPLY_COMPONENT).entries()].sort(
    (a, b) => a[1].arrivalTick - b[1].arrivalTick,
  );
  if (missions.length === 0) {
    html += `<div class="panel-hint">No missions scheduled — use the Supply Planner on the right.</div>`;
  }
  for (const [entity, mission] of missions) {
    const kg = mission.manifest.reduce((s, e) => s + e.kg, 0);
    const eta = mission.arrivalTick - now;
    const frac = Math.max(0.02, Math.min(1, eta / windowTicks));
    const label =
      mission.kind === "probe"
        ? "PROBE"
        : mission.kind === "sortie"
          ? "SORTIE"
          : `${kg.toFixed(0)} kg`;
    html += `<div class="gantt-row">
      <span>LUN-${entity} · ${mission.vehicle.toUpperCase()} <span class="panel-hint" style="display:inline">${label}${mission.repeatTicks > 0 ? " ⟳" : ""}</span></span>
      <div class="gantt-track"><div class="gantt-bar" style="left:0;width:${(frac * 100).toFixed(1)}%"></div></div>
      <span>${eta <= 0 ? "landing" : formatEta(eta)}</span>
    </div>`;
  }
  // Route overview: fixed cislunar geometry; per-leg numbers are the SDD's.
  html += `<div class="route-strip">
    <div class="route-node"><strong>EARTH LEO</strong>departure</div>
    <div class="route-arrow">Δv 3.15 km/s →<br/>TLI · 3 d</div>
    <div class="route-node"><strong>LUNAR ORBIT</strong>100 km</div>
    <div class="route-arrow">Δv 0.70 km/s →<br/>LOI</div>
    <div class="route-node"><strong>DESCENT</strong>powered</div>
    <div class="route-arrow">Δv 1.90 km/s →<br/>terminal</div>
    <div class="route-node"><strong>SHACKLETON</strong>surface ops</div>
  </div>`;
  html += `<h4 style="color:var(--amber)">VEHICLE CLASSES</h4><table class="veh-table"><tr><th>Vehicle</th><th>Payload</th><th>$/kg</th><th>Transit</th><th>Loss (ideal/real)</th></tr>`;
  for (const id of ["clps", "mid", "heavy", "starship"]) {
    try {
      const v = vehicleClass(pack, id);
      html += `<tr><td>${id.toUpperCase()}</td><td>${(v.payloadKg / 1000).toFixed(1)} t</td><td>$${v.usdPerKg.toLocaleString()}</td><td>${v.transitDays} d</td><td>${(v.failureIdeal * 100).toFixed(0)}% / ${(v.failureRealistic * 100).toFixed(0)}%</td></tr>`;
    } catch {
      // vehicle not in this pack (mods)
    }
  }
  html += `</table>`;
  root.innerHTML = html;
}

function formatEta(ticks: number): string {
  if (ticks < 48) {
    return `${ticks} h`;
  }
  return `${Math.floor(ticks / 24)}d ${ticks % 24}h`;
}

// ── industry: live production-chain cards + colony flow totals ──

export function renderIndustry(root: HTMLElement, world: World, pack: ContentPack): void {
  const report = world.ledgerReport();
  let html = "";
  if (report !== null) {
    html += `<div class="flow-totals">`;
    const net = new Map<string, number>();
    for (const byTag of [report.createdByResource, report.destroyedByResource]) {
      const sign = byTag === report.createdByResource ? 1 : -1;
      for (const [resource, tags] of Object.entries(byTag)) {
        let sum = 0;
        for (const kg of Object.values(tags)) {
          sum += kg;
        }
        net.set(resource, (net.get(resource) ?? 0) + sign * sum);
      }
    }
    const interesting = [...net.entries()]
      .filter(([, kg]) => Math.abs(kg * 24) > 0.05)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);
    for (const [resource, kgTick] of interesting) {
      const day = kgTick * 24;
      html += `<span class="chip">${resource} <strong class="${day >= 0 ? "io-out" : "io-in"}">${day >= 0 ? "+" : ""}${day.toFixed(1)} kg/d</strong></span>`;
    }
    html += `</div>`;
  }
  html += `<div class="ind-grid">`;
  const groups = new Map<string, { count: number; duty: number; building: BuildingComponent }>();
  for (const [, building] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
    const def = pack.building(building.defId);
    if (def.mining === undefined && def.reactions.length === 0 && def.eclss === undefined) {
      continue;
    }
    const entry = groups.get(building.defId) ?? { count: 0, duty: 0, building };
    entry.count++;
    entry.duty += building.poweredFraction * building.condition;
    groups.set(building.defId, entry);
  }
  if (groups.size === 0) {
    html += `<div class="panel-hint">No production buildings yet — mining and reactors appear here as they come online.</div>`;
  }
  for (const [defId, group] of groups) {
    const def = pack.building(defId);
    const duty = group.duty / group.count;
    let io = "";
    if (def.mining !== undefined) {
      const kgDay = def.mining.kgPerDay * duty * group.count;
      io += `<div class="io-row"><span class="io-in">regolith bed</span><span class="io-arrow">→</span><span class="io-out">+${kgDay.toFixed(0)} kg/d excavated</span></div>`;
    }
    for (const rid of def.reactions) {
      const reaction = pack.reaction(rid);
      const rated = (def.reactionKgPerDay[rid] ?? 0) * duty * group.count;
      const primary = reaction.outputs.find((o) => o.resource === reaction.primaryOutput);
      const batches = primary !== undefined && primary.kg > 0 ? rated / primary.kg : 0;
      const ins = reaction.inputs
        .map((i) => `<span class="io-in">−${(i.kg * batches).toFixed(1)} ${i.resource}</span>`)
        .join(" ");
      const outs = reaction.outputs
        .map((o) => `<span class="io-out">+${(o.kg * batches).toFixed(1)} ${o.resource}</span>`)
        .join(" ");
      io += `<div class="io-row">${ins}<span class="io-arrow">→</span>${outs}<span class="panel-hint" style="display:inline">kg/d</span></div>`;
    }
    if (def.eclss !== undefined) {
      io += `<div class="io-row"><span class="panel-hint" style="display:inline">life support loop — scrubbing, O₂ generation, water recovery</span></div>`;
    }
    html += `<div class="ind-card">
      <div class="ic-name"><span>${def.name}${group.count > 1 ? ` ×${group.count}` : ""}</span><span class="ic-duty">${(duty * 100).toFixed(0)}% duty</span></div>
      ${io}
    </div>`;
  }
  html += `</div>`;
  root.innerHTML = html;
}

// ── bottom bar: next event card ──

export function renderNextEvent(root: HTMLElement, world: World, tpld: number): void {
  const env = world.store<EnvironmentComponent>(ENVIRONMENT_COMPONENT).require(ENV_ENTITY);
  let best: { label: string; inTicks: number } | null = null;
  for (const [, pending] of world
    .store<PendingHazardComponent>(PENDING_HAZARD_COMPONENT)
    .entries()) {
    const inTicks = pending.impactTick - world.tickCount;
    if (inTicks > 0 && (best === null || inTicks < best.inTicks)) {
      best = { label: `☢ ${pending.eventId.toUpperCase()}`, inTicks };
    }
  }
  if (best === null) {
    const phaseLeft = env.isNight === 1 ? 1 - env.lunarPhase : 0.5 - env.lunarPhase;
    best = {
      label: env.isNight === 1 ? "☀ SUNRISE" : "🌑 NIGHT BEGINS",
      inTicks: Math.max(0, Math.round(phaseLeft * tpld)),
    };
  }
  root.innerHTML = `NEXT EVENT<strong>${best.label} in ${formatEta(best.inTicks)}</strong>`;
}

// ── exploration: rover fleet, expedition planner, traverse states ──

const ROVER_STATES = ["IDLE — charging", "OUTBOUND", "SURVEYING", "RETURNING", "⚠ STRANDED"];

export function renderExploration(
  root: HTMLElement,
  world: World,
  pack: ContentPack,
  planTarget: number | null,
  onPlan: (rover: number) => void,
): void {
  let html = "";
  const fleet = [...world.store<RoverComponent>(ROVER_COMPONENT).entries()];
  html += `<div class="panel-hint">Rovers survey tiles for science; icy PSR ground returns an ice core and characterizes the deposit (Phase 0 criterion). Watch the battery — stranded rovers stay stranded.</div>`;
  html += `<div class="ind-grid" style="margin-top:10px">`;
  for (const kind of ["scout", "prospector", "sampler"]) {
    let spec;
    try {
      spec = roverSpec(pack, kind);
    } catch {
      continue;
    }
    html += `<div class="ind-card">
      <div class="ic-name"><span>${kind.toUpperCase()}</span><span class="ic-duty">$${(spec.costUsd / 1e6).toFixed(0)}M</span></div>
      <div class="io-row"><span class="panel-hint" style="display:inline">${spec.speedKmh} km/h · ${spec.batteryKwh} kWh (~${((spec.batteryKwh / spec.drainKwhPerKm) * 0.45).toFixed(0)} km round trip) · survey ${spec.surveyHours} h · ${spec.cargoKg} kg hold</span></div>
      <button data-order-rover="${kind}">Order ${kind}</button>
    </div>`;
  }
  html += `</div><h4 style="color:var(--amber);margin-top:14px">FLEET — ${fleet.length} unit(s)</h4>`;
  if (fleet.length === 0) {
    html += `<div class="panel-hint">No rovers yet — order one above (it rides the next CLPS-class lander).</div>`;
  }
  for (const [entity, rover] of fleet) {
    const spec = roverSpec(pack, rover.kind);
    const battery = (rover.batteryKwh / spec.batteryKwh) * 100;
    const planning = planTarget === entity;
    html += `<div class="gantt-row" style="grid-template-columns: 170px 1fr 230px">
      <span>EXPLORER-${entity}<br/><span class="panel-hint" style="display:inline">${rover.kind} · (${rover.x.toFixed(0)}, ${rover.y.toFixed(0)})</span></span>
      <span>
        <span class="${rover.state === 4 ? "io-in" : "io-out"}">${ROVER_STATES[rover.state]}</span>
        <div class="bar"><div class="hp" style="width:${battery.toFixed(0)}%;background:${battery < 25 ? "var(--crit)" : "var(--good)"}"></div></div>
        <div class="bar-label"><span>battery ${battery.toFixed(0)}%</span><span>cond ${(rover.condition * 100).toFixed(0)}% · surveys ${rover.surveysDone}</span></div>
      </span>
      <span style="text-align:right">
        ${rover.state === 0 ? `<button data-plan-rover="${entity}" class="${planning ? "active" : ""}">${planning ? "Click the map…" : "🎯 Plan expedition"}</button>` : ""}
        ${rover.state === 1 || rover.state === 2 ? `<button data-recall-rover="${entity}">Recall</button>` : ""}
      </span>
    </div>`;
  }
  root.innerHTML = html;
  for (const button of root.querySelectorAll("[data-order-rover]")) {
    button.addEventListener("click", () => {
      world.enqueueCommand(CMD_ORDER_ROVER, {
        kind: button.getAttribute("data-order-rover") as string,
      });
    });
  }
  for (const button of root.querySelectorAll("[data-plan-rover]")) {
    button.addEventListener("click", () => {
      onPlan(Number(button.getAttribute("data-plan-rover")));
    });
  }
  for (const button of root.querySelectorAll("[data-recall-rover]")) {
    button.addEventListener("click", () => {
      world.enqueueCommand(CMD_RECALL_ROVER, {
        rover: Number(button.getAttribute("data-recall-rover")),
      });
    });
  }
}
