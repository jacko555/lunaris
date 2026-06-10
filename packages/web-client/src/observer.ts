import {
  BUILDING_COMPONENT,
  COLONY_ENTITY,
  CREW_COMPONENT,
  ECONOMY_COMPONENT,
  GRID_COMPONENT,
  GRID_ENTITY,
  PHASE_COMPONENT,
  STATS_COMPONENT,
  type BuildingComponent,
  type CrewComponent,
  type EconomyComponent,
  type GridComponent,
  type PhaseComponent,
  type StatsComponent,
  type World,
} from "@lunaris/sim-core";

/**
 * Observer-mode dashboard (M6 web tasks): per-game-day sampled series
 * rendered as dependency-free canvas sparklines (UI-UX.md sim-mode
 * wireframe), plus the milestone timeline ribbon. Charts redraw in ~0.1 ms;
 * uPlot (TAD's pick) becomes worth it when we add zoom/cursor interactions.
 */

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  sample(world: World): number;
  format(v: number): string;
}

export const OBSERVER_SERIES: SeriesDef[] = [
  {
    key: "population",
    label: "Population",
    color: "#6fcf97",
    sample: (w) =>
      [...w.store<CrewComponent>(CREW_COMPONENT).entries()].filter(([, c]) => c.alive === 1).length,
    format: (v) => v.toFixed(0),
  },
  {
    key: "power",
    label: "Power gen kW",
    color: "#f2c94c",
    sample: (w) => w.store<GridComponent>(GRID_COMPONENT).require(GRID_ENTITY).generationKw,
    format: (v) => v.toFixed(1),
  },
  {
    key: "closure",
    label: "O₂+H₂O local %",
    color: "#56ccf2",
    sample: (w) =>
      w.store<StatsComponent>(STATS_COMPONENT).require(COLONY_ENTITY).lastCycleLocalShare * 100,
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: "dose",
    label: "Max 30d dose mSv",
    color: "#eb5757",
    sample: (w) => {
      let max = 0;
      for (const [, crew] of w.store<CrewComponent>(CREW_COMPONENT).entries()) {
        if (crew.alive === 1) {
          max = Math.max(
            max,
            crew.dose30d.reduce((s, d) => s + d, 0),
          );
        }
      }
      return max;
    },
    format: (v) => v.toFixed(1),
  },
  {
    key: "budget",
    label: "Budget $B",
    color: "#bb6bd9",
    sample: (w) =>
      w.store<EconomyComponent>(ECONOMY_COMPONENT).require(COLONY_ENTITY).balanceUsd / 1e9,
    format: (v) => `$${v.toFixed(1)}B`,
  },
  {
    key: "buildings",
    label: "Buildings",
    color: "#e2e8f0",
    sample: (w) => w.store<BuildingComponent>(BUILDING_COMPONENT).size,
    format: (v) => v.toFixed(0),
  },
];

const MAX_POINTS = 1024;

export class SeriesBuffer {
  readonly values: number[] = [];
  private lastDay = -1;

  /** Sample once per game-day; keeps a bounded window by decimating 2:1. */
  push(world: World, def: SeriesDef): void {
    const day = Math.floor(world.tickCount / 24);
    if (day === this.lastDay) {
      return;
    }
    this.lastDay = day;
    this.values.push(def.sample(world));
    if (this.values.length > MAX_POINTS) {
      for (let i = 0; i < this.values.length >> 1; i++) {
        this.values[i] = this.values[i * 2] as number;
      }
      this.values.length = this.values.length >> 1;
    }
  }

  reset(): void {
    this.values.length = 0;
    this.lastDay = -1;
  }
}

export function drawSparkline(
  canvas: HTMLCanvasElement,
  values: number[],
  color: string,
  shadowValues: number[] = [],
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null || values.length < 2) {
    return;
  }
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  // Shared scale so the two failure-table runs compare honestly.
  const all = shadowValues.length > 1 ? values.concat(shadowValues) : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const trace = (vals: number[]): void => {
    ctx.beginPath();
    for (let i = 0; i < vals.length; i++) {
      const x = (i / (vals.length - 1)) * (w - 2) + 1;
      const y = h - 2 - (((vals[i] as number) - min) / span) * (h - 6);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };
  if (shadowValues.length > 1) {
    ctx.strokeStyle = "rgba(160, 170, 190, 0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    trace(shadowValues);
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  trace(values);
}

/** The milestone ribbon: "2026.4 ▸ ice-characterized" lines, newest last. */
export function renderTimeline(root: HTMLElement, world: World, startYear: number): void {
  const phase = world.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY);
  const lines = phase.milestones.map((m) => {
    const year = (startYear + m.tick / 8766).toFixed(1);
    const big = m.id.startsWith("phase");
    return `<div class="tl-row${big ? " tl-phase" : ""}"><span>${year}</span><span>${m.id}</span></div>`;
  });
  root.innerHTML =
    `<h4>MISSION TIMELINE — Phase ${phase.phase}</h4>` +
    (lines.length > 0 ? lines.join("") : `<div class="panel-hint">No milestones yet</div>`);
}
