import {
  CMD_CANCEL_RESUPPLY,
  CMD_SCHEDULE_RESUPPLY,
  CMD_START_RESEARCH,
  COLONY_ENTITY,
  ECONOMY_COMPONENT,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  RESUPPLY_COMPONENT,
  STATS_COMPONENT,
  effectiveTechCost,
  hardPrereqsMet,
  type ContentPack,
  type EconomyComponent,
  type PhaseComponent,
  type ResearchComponent,
  type ResupplyComponent,
  type StatsComponent,
  type Tech,
  type World,
} from "@lunaris/sim-core";

/**
 * Side-panel tabs (M4/M5 web tasks): Build menu with prerequisites and
 * real-chemistry tooltips, tech tree, colony (phase criteria + finance +
 * ISRU stats), and the resupply planner. All panels are stateless renders
 * over the world; commands go through the same queue as everything else.
 */

export interface UiState {
  tab: string;
  selectedBuild: string | null;
  flowResource: string;
}

const usd = (v: number): string =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(1)}M`;

// ── Build menu ──

export function renderBuildMenu(
  root: HTMLElement,
  world: World,
  pack: ContentPack,
  ui: UiState,
  onSelect: (defId: string | null) => void,
): void {
  const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(COLONY_ENTITY);
  const cards: HTMLElement[] = [];
  const sorted = [...pack.buildings].sort((a, b) => a.tier - b.tier || (a.id < b.id ? -1 : 1));
  for (const def of sorted) {
    const locked = def.techRequired !== null && !research.unlocked.includes(def.techRequired);
    const card = document.createElement("div");
    card.className = `build-card${ui.selectedBuild === def.id ? " selected" : ""}${locked ? " locked" : ""}`;
    const cost =
      def.buildCost.local.length > 0
        ? `local: ${def.buildCost.local.map((e) => `${e.kg} kg ${e.resource}`).join(", ")}`
        : `import: ${def.buildCost.imported.map((e) => `${e.kg} kg ${e.resource}`).join(", ")}`;
    const chemistry = def.reactions
      .map((rid) => {
        const r = pack.reaction(rid);
        const inputs = r.inputs.map((e) => `${e.kg} ${e.resource}`).join(" + ");
        const outputs = r.outputs.map((e) => `${e.kg} ${e.resource}`).join(" + ");
        return `${inputs} → ${outputs} (${r.energyKwhPerKgPrimary} kWh/kg)`;
      })
      .join("\n");
    card.title = `${def.analogue}\n${chemistry}${def.mining ? `\nMines ${def.mining.kgPerDay} kg/day (ice yield = tile concentration)` : ""}`;
    card.innerHTML = `
      <div class="bc-name">${def.name} <span class="bc-tier">T${def.tier}</span></div>
      <div class="bc-stats">${def.powerKw >= 0 ? "+" : ""}${def.powerKw} kW · ${(def.massKg / 1000).toFixed(1)} t</div>
      <div class="bc-cost">${cost}</div>
      ${locked ? `<div class="bc-lock">🔒 ${def.techRequired}</div>` : ""}`;
    if (!locked) {
      card.addEventListener("click", () => {
        onSelect(ui.selectedBuild === def.id ? null : def.id);
      });
    }
    cards.push(card);
  }
  const hint = document.createElement("div");
  hint.className = "panel-hint";
  hint.textContent = ui.selectedBuild
    ? `Placing '${ui.selectedBuild}' — click a map tile to queue construction (Esc to cancel)`
    : "Select a building, then click the map to queue it. Hover cards for the real chemistry.";
  root.replaceChildren(hint, ...cards);
}

// ── Tech tree ──

export function renderTechPanel(root: HTMLElement, world: World, pack: ContentPack): void {
  const research = world.store<ResearchComponent>(RESEARCH_COMPONENT).require(COLONY_ENTITY);
  const header = document.createElement("div");
  header.className = "panel-hint";
  header.textContent = `Science: ${research.sciencePoints.toFixed(1)} pts${research.current !== "" ? ` · researching ${research.current} (${research.progress.toFixed(0)}/${effectiveTechCost(pack.techNode(research.current), research.unlocked).toFixed(0)})` : ""}`;
  const rows: HTMLElement[] = [header];
  const byBranch = new Map<string, Tech[]>();
  for (const tech of pack.tech) {
    const list = byBranch.get(tech.branch) ?? [];
    list.push(tech);
    byBranch.set(tech.branch, list);
  }
  // Mockup v2 research grid: branch columns become titled sections (the
  // 300px side panel can't fit five columns), rows ordered by unlock phase
  // then cost — the same reading order as the phase-gate grid.
  const BRANCH_NAMES: Record<string, string> = {
    A: "Transportation & Landing",
    B: "Power & Thermal",
    C: "ISRU & Industry",
    D: "Life Support & Habitation",
    E: "Science & Operations",
  };
  for (const branch of [...byBranch.keys()].sort()) {
    // One column per branch (mockup v2 research grid); the container's CSS
    // grid wraps columns responsively, the side-panel fallback stacks them.
    const column = document.createElement("div");
    column.className = "branch-col";
    rows.push(column);
    const title = document.createElement("h4");
    title.textContent = BRANCH_NAMES[branch] ?? `Branch ${branch}`;
    column.appendChild(title);
    const ordered = (byBranch.get(branch) as Tech[])
      .slice()
      .sort((a, b) => a.phase - b.phase || a.costScience - b.costScience || (a.id < b.id ? -1 : 1));
    for (const tech of ordered) {
      const done = research.unlocked.includes(tech.id);
      const current = research.current === tech.id;
      const available = !done && !current && hardPrereqsMet(tech, research.unlocked);
      const row = document.createElement("div");
      row.className = `tech-row${done ? " done" : ""}${current ? " current" : ""}`;
      row.title = `${tech.source}\nTRL ${tech.trl2026} · prereqs: ${tech.prereqs.join(", ") || "none"}\nUnlocks: ${tech.unlocks.buildings.join(", ") || "capability"}`;
      row.innerHTML = `<span>${done ? "✓ " : ""}${tech.id} <span class="bc-tier">P${tech.phase}·TRL${tech.trl2026}</span></span><span>${tech.costScience}</span>`;
      if (available) {
        const button = document.createElement("button");
        button.textContent = "Research";
        button.addEventListener("click", () => {
          // Command captured via closure on the live world reference.
          row.dispatchEvent(
            new CustomEvent("lunaris-research", { bubbles: true, detail: tech.id }),
          );
        });
        row.appendChild(button);
      }
      column.appendChild(row);
    }
  }
  root.replaceChildren(...rows);
}

// ── Colony: phase criteria, finance, ISRU stats ──

export function renderColonyPanel(root: HTMLElement, world: World): void {
  const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
  const economy = world.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY);
  const stats = world.store<StatsComponent>(STATS_COMPONENT).require(COLONY_ENTITY);
  const check = (ok: boolean, label: string): string =>
    `<div class="crit${ok ? " ok" : ""}">${ok ? "✓" : "○"} ${label}</div>`;
  let criteria = "";
  if (phase.phase === 0) {
    criteria =
      check(
        phase.successfulLandings >= 2,
        `2 successful landings (${phase.successfulLandings}/2)`,
      ) +
      check(phase.iceCharacterized === 1, "ice deposit characterized") +
      check(phase.commsActive === 1, "comms relay active");
  } else if (phase.phase === 1) {
    criteria =
      check(phase.sortiesCompleted >= 2, `2 sorties (${phase.sortiesCompleted}/2)`) +
      check(false, "surface_power_40kw researched (see Tech)");
  } else if (phase.phase === 2) {
    criteria =
      check(phase.nightSurvived === 1, "survive a full crewed lunar night") +
      check(
        phase.occupationTicks >= 180 * 24,
        `6 months continuous occupation (${Math.floor(phase.occupationTicks / 24)}/180 d)`,
      ) +
      check(phase.isruDemo === 1, "first local O₂/water (ISRU demo)");
  } else {
    criteria = `<div class="crit ok">Phase 3: permanent base. Next: closure ≥50%, pop ≥50 (v1.0)</div>`;
  }
  root.innerHTML = `
    <h4>Phase ${phase.phase}</h4>${criteria}
    <h4>ISRU</h4>
    <div class="crit${stats.isru50Milestone === 1 ? " ok" : ""}">${stats.isru50Milestone === 1 ? "✓" : "○"} ≥50% O₂+water local (last cycle: ${(stats.lastCycleLocalShare * 100).toFixed(0)}%)</div>
    <div class="panel-hint">local ${stats.cumulativeLocalKg.toFixed(0)} kg · imported ${stats.cumulativeImportedKg.toFixed(0)} kg (cumulative)</div>
    <h4>Finance</h4>
    <div class="kv"><span>Balance</span><span${economy.balanceUsd < 0 ? ' style="color:var(--crit)"' : ""}>${usd(economy.balanceUsd)}</span></div>
    <div class="kv"><span>Launch spend</span><span>${usd(economy.totalLaunchSpendUsd)}</span></div>
    <div class="kv"><span>Ops spend</span><span>${usd(economy.totalOpsSpendUsd)}</span></div>
    <div class="kv"><span>Revenue (LOX)</span><span>${usd(economy.totalRevenueUsd)}</span></div>
    <div class="panel-hint">Milestones: ${phase.milestones.join(" · ") || "none yet"}</div>`;
}

// ── Resupply planner ──

const MANIFEST_PRESETS: Record<string, { resource: string; kg: number }[]> = {
  "Consumables (food/water/meds)": [
    { resource: "food", kg: 160 },
    { resource: "water", kg: 300 },
    { resource: "medkits", kg: 5 },
  ],
  "Spares (parts 500 kg)": [{ resource: "spare-parts", kg: 500 }],
  "O₂ emergency (200 kg)": [{ resource: "o2-gas", kg: 200 }],
  "Hardware (components 5 t)": [{ resource: "machine-components", kg: 5000 }],
};

export function renderSupplyPanel(
  root: HTMLElement,
  world: World,
  pack: ContentPack,
  targetEntity: number,
): void {
  const missions = world.store<ResupplyComponent>(RESUPPLY_COMPONENT);
  const rows: HTMLElement[] = [];
  const hint = document.createElement("div");
  hint.className = "panel-hint";
  hint.textContent = "Schedule cargo (heavy-lift, 4-day transit). Costs charge at launch.";
  rows.push(hint);
  for (const [label, manifest] of Object.entries(MANIFEST_PRESETS)) {
    const kg = manifest.reduce((s, e) => s + e.kg, 0);
    const button = document.createElement("button");
    button.className = "supply-btn";
    button.textContent = `${label} — ${usd(kg * 100000)}`;
    button.addEventListener("click", () => {
      world.enqueueCommand(CMD_SCHEDULE_RESUPPLY, {
        manifest,
        arrivalTick: 0,
        targetEntity,
        vehicle: "heavy",
      });
    });
    rows.push(button);
  }
  const list = document.createElement("div");
  let html = "<h4>Missions in flight / standing</h4>";
  let count = 0;
  for (const [entity, mission] of missions.entries()) {
    count++;
    html += `<div class="kv"><span>${mission.kind} (${mission.vehicle}) → t${mission.arrivalTick}${mission.repeatTicks > 0 ? ` ↻${mission.repeatTicks}` : ""}</span><span><a href="#" data-cancel="${entity}">cancel</a></span></div>`;
  }
  if (count === 0) {
    html += `<div class="panel-hint">none</div>`;
  }
  list.innerHTML = html;
  list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const cancel = target.getAttribute("data-cancel");
    if (cancel !== null) {
      event.preventDefault();
      world.enqueueCommand(CMD_CANCEL_RESUPPLY, { entity: Number(cancel) });
    }
  });
  rows.push(list);
  void pack;
  root.replaceChildren(...rows);
}

// ── Resource flow inspector ──

export function renderFlows(
  root: HTMLElement,
  world: World,
  pack: ContentPack,
  ui: UiState,
  onPick: (resource: string) => void,
): void {
  const select = document.createElement("select");
  for (const resource of pack.resources) {
    const option = document.createElement("option");
    option.value = resource.id;
    option.textContent = resource.name;
    option.selected = resource.id === ui.flowResource;
    select.appendChild(option);
  }
  select.addEventListener("change", () => onPick(select.value));
  const report = world.ledgerReport();
  let html = "";
  if (report !== null) {
    const created = report.createdByResource[ui.flowResource] ?? {};
    const destroyed = report.destroyedByResource[ui.flowResource] ?? {};
    html += `<div class="panel-hint">last tick × 24 = per day</div>`;
    for (const [tag, kg] of Object.entries(created)) {
      html += `<div class="kv"><span style="color:var(--good)">+ ${tag}</span><span>${(kg * 24).toFixed(2)} kg/d</span></div>`;
    }
    for (const [tag, kg] of Object.entries(destroyed)) {
      html += `<div class="kv"><span style="color:var(--crit)">− ${tag}</span><span>${(kg * 24).toFixed(2)} kg/d</span></div>`;
    }
    if (Object.keys(created).length === 0 && Object.keys(destroyed).length === 0) {
      html += `<div class="panel-hint">no flows this tick</div>`;
    }
  }
  const body = document.createElement("div");
  body.innerHTML = html;
  root.replaceChildren(select, body);
}

export function handleResearchEvents(root: HTMLElement, getWorld: () => World): void {
  root.addEventListener("lunaris-research", (event) => {
    const techId = (event as CustomEvent).detail as string;
    getWorld().enqueueCommand(CMD_START_RESEARCH, { techId });
  });
}

// ── Lunarpedia (M7): every entity links to its real-world source notes ──

export function renderLunarpedia(root: HTMLElement, pack: ContentPack, filter: string): void {
  const needle = filter.toLowerCase();
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search the Lunarpedia…";
  input.value = filter;
  input.addEventListener("input", () => {
    root.dispatchEvent(new CustomEvent("lunaris-pedia", { bubbles: true, detail: input.value }));
  });
  const list = document.createElement("div");
  let html = "";
  for (const entry of pack.encyclopedia) {
    if (
      needle !== "" &&
      !entry.title.toLowerCase().includes(needle) &&
      !entry.body.toLowerCase().includes(needle)
    ) {
      continue;
    }
    html += `<details class="pedia"><summary>${entry.title}</summary>
      <p>${entry.body}</p>
      <p class="pedia-real"><strong>Real world:</strong> ${entry.realWorld}</p>
      <p class="panel-hint">Sources: ${entry.sources.join(" · ")}</p>
    </details>`;
  }
  list.innerHTML = html === "" ? `<div class="panel-hint">No matches</div>` : html;
  root.replaceChildren(input, list);
}
