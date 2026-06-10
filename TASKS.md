# TASKS.md — Engineering Task List (for Claude Code)

Work top-to-bottom. Each milestone ends with acceptance criteria. Check off tasks as completed. Do not start a milestone until the previous one's acceptance criteria pass.

Legend: `[core]` sim-core · `[web]` web client · `[data]` JSON content · `[infra]` tooling/CI · `[docs]` documentation

---

## Milestone 0 — Repo & Tooling (1–2 sessions)

- [x] [infra] Init pnpm monorepo: `packages/sim-core`, `packages/web-client`, `data/`, `docs/`, `tests/`, `tools/`
- [x] [infra] TypeScript strict config shared via `tsconfig.base.json`; ESLint + Prettier; Vitest
- [x] [infra] Vite setup for web-client; sim-core builds as a pure ESM library (NO DOM imports — enforce with lint rule)
- [x] [infra] GitHub Actions CI: lint, typecheck, unit tests, determinism golden test (added in M1)
- [x] [infra] GitHub Pages deploy workflow (build web-client → `gh-pages` branch)
- [x] [docs] Commit PRD.md, CLAUDE.md, docs/\*, LICENSE (MIT for code), assets license file, CONTRIBUTING.md + CLA
- [x] [infra] Seeded PRNG utility (mulberry32 or xoshiro) — single RNG instance owned by the world; no `Math.random` anywhere (lint ban)

**Accept:** `pnpm test` green; CI green; empty page deploys to GitHub Pages.

---

## Milestone 1 — Deterministic ECS Core (the heart)

- [x] [core] ECS: `World` (entities, components, systems registry, RNG, tick counter), typed component stores
- [x] [core] Fixed-timestep loop: `world.tick()` = 1 game-hour; pure function of (world state, queued commands)
- [x] [core] Command queue: all external inputs (player or AI) enter as serializable commands; record input log
- [x] [core] Save/load: serialize world → versioned JSON; load reproduces identical state hash
- [x] [core] World hash function (stable stringify + FNV/xxhash) for determinism tests
- [x] [core] Data loader: parse/validate JSON content packs against docs/DATA-SCHEMA.md (use zod); base pack in `data/base/`
- [x] [tests] Golden test: fixed seed + scripted commands, 1,000 ticks → expected hash; runs in CI
- [x] [tests] Property test: mass conservation — sum of all resource mass changes per tick equals declared sources/sinks

**Accept:** determinism test green across Node versions; save→load→hash identical.

---

## Milestone 2 — Environment, Power, Thermal

- [x] [core] Environment system: lunar epoch clock (29.53-day synodic cycle), per-site illumination profile (south-pole site: ~90% lit ridge tiles, PSR tiles 0%), surface temperature curve (+127 °C ↔ −173 °C; PSR constant 40 K)
- [x] [data] Map definition: 64×64 tile Shackleton-rim site; tile fields: elevation, illuminationClass, iceConcentration (0–5.6 wt%), regolithType (highland/mare), slope
- [x] [core] Power system: producers (solar array — output scales with illumination; fission 40 kWe flat; RTG 0.1–1 kWe), storage (battery, regenerative fuel cell), consumers with priority tiers (life-support > thermal > industry); brownout sheds lowest tier first
- [x] [core] Thermal system: building heat balance — internal generation vs radiator capacity vs environment; night heating load; overheat/freeze damage states
- [x] [web] Minimal render: PixiJS tile map, building sprites (placeholder shapes), day/night tint, time controls (pause/1×/fast)
- [x] [web] HUD v0: power bar (gen/use/stored), clock showing lunar day fraction, alert toasts

**Accept:** a solar+battery test base browns out and freezes during lunar night without fission/fuel-cell capacity; with 40 kWe fission it survives. Visible in browser.

---

## Milestone 3 — Crew & ECLSS (Phase 2 vertical)

- [x] [core] Crew entities: health, radiation dose (mSv accumulator), morale, role, location, EVA state
- [x] [core] ECLSS system: per-person-day O₂ 0.84 kg / water 3.54 kg / food 0.62 kg; CO₂ 1.0 kg out; habitat atmosphere store; CO₂ scrubber; water recycling loop with closure % parameter (default 93%, upgradable to 98%); Sabatier processor optional (CO₂+4H₂→CH₄+2H₂O)
- [x] [core] Radiation system: chronic dose 0.5 mSv/day surface, reduced by shielding g/cm² per building; SPE event applies large dose unless crew in shelter (≥10 g/cm²); enforce 250 mSv/30-day rule → health damage beyond
- [x] [core] Health drift: bone/muscle decay in 1/6 g mitigated by exercise equipment hours; medical events consume medkits/clinic capacity
- [x] [core] Consumable storage + Earth resupply v0: scheduled cargo lander delivers manifests; cost from $/kg parameter
- [x] [data] Buildings v0 (from docs/BUILDINGS.md tier 0–2): hab module, storm shelter, solar array, battery, fission unit, radiator, storage, comms tower, exercise module, clinic
- [x] [web] Crew roster panel; building inspector (inputs/outputs/state); alert queue with cause text

**Accept:** 6-crew outpost survives 3 lunar cycles with scheduled resupply; killing resupply causes legible cascade (food→morale→health) within expected tick counts (unit-tested).

---

## Milestone 4 — ISRU Chains + Construction → **v0.1 MVP**

- [x] [core] Reaction processor framework: building consumes inputs → outputs at rate, gated by power/thermal/crew-ops, per docs/ECONOMY.md
- [x] [data] Reactions: ice mining (PSR tile, yield = tile iceConcentration), water electrolysis (H₂+O₂), MRE (regolith → O₂ 28 kg/100 kg + metal slag; 26–40 kWh/kg O₂), Sabatier, LOX liquefaction (11.3 kWh/kg all-in chain)
- [x] [core] Construction system: build queue, material costs (Earth-imported vs printed-regolith discount), build time, regolith works (berm = shielding, landing pad = dust mitigation)
- [x] [core] Dust system: EVA and unpaved landings raise dust exposure → solar degradation %/cycle, mechanical wear on moving parts; pads/airlock upgrades mitigate
- [x] [core] Hazard engine v0 + events from docs/EVENTS.md: SPE (with 24–48h warning), micrometeorite strike, equipment failure (MTBF per building), moonquake (rare, structural stress), resupply launch failure (per-vehicle p)
- [x] [web] Build menu with prerequisites; ISRU chain tooltips showing real chemistry; resource flow inspector
- [x] [web] Onboarding: guided first-night tutorial (build shelter → power for night → first ISRU water)
- [x] [infra] Deploy v0.1 to GitHub Pages + itch.io _(Pages live on every push; itch.io upload pending account credentials — butler push ready when provided)_
- [x] [tests] Scenario regression: "MVP baseline" 5,000-tick golden hash

**Accept (v0.1 MVP):** Player can reach "≥50% O₂+water locally produced" milestone; first-time playtester survives night ≤3 attempts; deploys publicly.

---

## Milestone 5 — Phases, Tech Tree, Economy

- [x] [core] Phase engine: Phases 0–3 with transition criteria (docs/PHASES.md); milestone toasts + summary screens
- [x] [core] Research system: science points from labs/crew scientists; tech tree from data (docs/TECH-TREE.md), unlock gating
- [x] [core] Budget/economy: starting budget by scenario; launch costs by vehicle ($/kg classes: legacy ~$1M/kg-to-surface era → commercial heavy ~$100k/kg → Starship-class target tiers); ongoing ops cost; Phase-3 propellant sales revenue hook
- [x] [data] Phase 0–1 content: robotic lander missions (prospecting gameplay: choose landing sites, ~50% historical failure rate in Realistic mode), sortie missions
- [x] [core] Logistics v1: launch windows, transit time (~3–5 days), vehicle classes (CLPS-class 100 kg, mid-class 1–2 t, heavy 10–15 t, Starship-class 100 t with refueling-chain prerequisite)
- [x] [web] Tech tree screen; phase progress screen; finance panel; resupply planner UI

**Accept:** full Phase 0→3 playthrough possible in game mode; tech gating verified by tests.

---

## Milestone 6 — Simulation Mode → **v0.5 Vertical Slice**

- [ ] [core] Policy AI: data-driven heuristic agent issuing the same command types as a player (build priorities, resupply cadence, research order, crisis responses) — lives in sim-core, configured per scenario
- [ ] [data] Scenario presets: Artemis Baseline 2026, Ideal Trajectory, Realistic Trajectory, ILRS Race, Commercial Bootstrap — each sets budget, cadence, failure tables (ideal vs realistic), agency flavor
- [ ] [web] Scenario config screen (all knobs exposed); observer dashboard: milestone timeline, charts (population, power, closure %, dose, budget) via lightweight chart lib; event log with real-mission flavor text
- [ ] [core] Mid-run handoff: pause simulation mode → convert to manual game mode (same world)
- [ ] [web] Speed controls up to 1 lunar day/min; auto-pause rules configurable
- [ ] [tests] Sim-mode reproducibility: each preset, fixed seed → fixed milestone timeline hash

**Accept (v0.5):** "Realistic Trajectory" auto-run produces a plausible 2026–2040 timeline; user can intervene mid-run; charts render.

---

## Milestone 7 — Phases 4–6, Depth & Polish → **v1.0**

- [ ] [core] Food production: hydroponics modules (40–50 m²/person full diet; LED power dominant cost), partial-closure math, crop variety morale bonus
- [ ] [core] Population growth: immigration waves, births (Phase 4+), demographics, housing/mood constraints
- [ ] [core] Manufacturing & spares: workshop produces spare parts from metals → reduces import dependency; "mass closure %" colony stat
- [ ] [core] Phase 5 exports: mass driver build (MW-scale power prereq), He-3 regolith processing (volatile extraction; flag speculative economics), propellant depot sales, space-solar beaming
- [ ] [core] International competition layer: rival agency progress ticker (ILRS), Accords/safety-zone flavor events
- [ ] [core] Phase 6 sandbox: domed crater megaproject, autonomy referendum event chain (clearly flagged speculative)
- [ ] [data] Full building catalog (all tiers), full tech tree, full event set
- [ ] [web] Encyclopedia ("Lunarpedia") — every entity links to real-world source notes from data `source` fields
- [ ] [web] Accessibility pass (keyboard, colorblind palette); save export/import UI; mod-pack loader UI
- [ ] [infra] v1.0 release: tag, itch.io page, announcement README

**Accept (v1.0):** full phase arc playable; mod pack demo loads; accessibility checklist passes.

---

## Milestone 8 — Godot 4 / Steam Port (Stage 4, threshold-gated)

Trigger: M3 success metric met (community traction) AND sim-core API stable for 60 days.

- [ ] Port sim-core to GDScript (or evaluate GDExtension/WASM embedding of the TS core — spike first)
- [ ] Rebuild UI in Godot scenes; 2.5D/3D visual upgrade per ART-DIRECTION.md §Godot
- [ ] GodotSteam integration: achievements, cloud saves, workshop (mods)
- [ ] Keep web build free & current; Steam build adds convenience features (CDDA model)

---

## Standing tasks (every milestone)

- Update golden hashes only with explicit justification in the PR description
- Every new constant: add to SDD constants table with `source` + `as_of`
- Every new content JSON: schema-validated in CI
- Changelog entry per merged PR
