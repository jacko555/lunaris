import {
  BUILDING_COMPONENT,
  COLONY_ENTITY,
  PHASE_COMPONENT,
  RESEARCH_COMPONENT,
  SITE_COMPONENT,
  type BuildingComponent,
  type PhaseComponent,
  type ResearchComponent,
  type SiteComponent,
  type World,
} from "@lunaris/sim-core";

/**
 * "First Night" guided tutorial (GDD §5, TASKS.md M4 onboarding): the
 * scripted Phase-2 mini-scenario teaching power → thermal → ECLSS →
 * shelter → the night itself → first ISRU water. Steps auto-check against
 * world state; no scripting hooks into the sim.
 */

export interface TutorialStep {
  title: string;
  hint: string;
  done(world: World): boolean;
}

function hasBuilt(world: World, defId: string, count = 1): boolean {
  let n = 0;
  for (const [, b] of world.store<BuildingComponent>(BUILDING_COMPONENT).entries()) {
    if (b.defId === defId) {
      n++;
    }
  }
  return n >= count;
}

function hasQueuedOrBuilt(world: World, defId: string): boolean {
  if (hasBuilt(world, defId)) {
    return true;
  }
  for (const [, s] of world.store<SiteComponent>(SITE_COMPONENT).entries()) {
    if (s.defId === defId) {
      return true;
    }
  }
  return false;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Power for the night",
    hint: "Solar dies at sunset for 354 hours. Queue a Fission Surface Power unit (Build tab) before the night arrives.",
    done: (w) => hasQueuedOrBuilt(w, "fission-surface-power"),
  },
  {
    title: "Reject the heat",
    hint: "Your habitat's waste heat has nowhere to go. Queue a Radiator Wing.",
    done: (w) => hasQueuedOrBuilt(w, "radiator-wing"),
  },
  {
    title: "Close the life-support loop",
    hint: "Crew exhale 1 kg CO₂ each per day. Queue an ECLSS Core: scrubber, oxygen generator, water recycler.",
    done: (w) => hasQueuedOrBuilt(w, "eclss-core"),
  },
  {
    title: "A place to hide",
    hint: "Solar storms deliver up to 500 mSv unsheltered. Queue a Storm Shelter (≥10 g/cm²).",
    done: (w) => hasQueuedOrBuilt(w, "storm-shelter"),
  },
  {
    title: "Survive the lunar night",
    hint: "Keep everyone alive from sunset to sunrise. Watch the power bar — fission carries the load.",
    done: (w) =>
      w.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY).nightSurvived === 1,
  },
  {
    title: "Research ice mining",
    hint: "Open the Tech tab and research ice_mining_pilot (Branch C) — your field labs are generating science.",
    done: (w) =>
      w
        .store<ResearchComponent>(RESEARCH_COMPONENT)
        .require(COLONY_ENTITY)
        .unlocked.includes("ice_mining_pilot"),
  },
  {
    title: "First lunar water",
    hint: "Place an Ice Harvester on a dark PSR tile (the crater), and a Volatile Oven at base. Local water beats $100k/kg imports.",
    done: (w) => w.store<PhaseComponent>(PHASE_COMPONENT).require(COLONY_ENTITY).isruDemo === 1,
  },
];

export function renderTutorial(root: HTMLElement, world: World): void {
  let firstOpen = -1;
  const rows = TUTORIAL_STEPS.map((step, i) => {
    const done = step.done(world);
    if (!done && firstOpen < 0) {
      firstOpen = i;
    }
    const active = !done && firstOpen === i;
    return `<div class="tut-step${done ? " done" : ""}${active ? " active" : ""}">
      <div>${done ? "✓" : active ? "▶" : "○"} ${step.title}</div>
      ${active ? `<div class="tut-hint">${step.hint}</div>` : ""}
    </div>`;
  });
  const allDone = firstOpen === -1;
  root.innerHTML = `<h4>FIRST NIGHT ${allDone ? "— COMPLETE 🌗" : ""}</h4>${rows.join("")}`;
  root.classList.toggle("complete", allDone);
}
