# Product Requirements Document (PRD)

## Project: LUNARIS — A Hard-Realism Lunar Colonization Simulation & Game

**Version:** 1.0 · **Date:** June 2026 · **Status:** Approved for development
**Owner:** Project founder · **Built with:** Claude Code

---

## 1. Vision

LUNARIS is an open-source, hard-realism simulation and strategy game of humanity's colonization of the Moon — from the first robotic landers to a self-sustaining lunar city and beyond. Every system is grounded in real physics, real chemistry (ISRU), and the real 2026 state of the space industry (NASA Artemis/Moon Base, SpaceX, Blue Origin, China's ILRS, CLPS commercial landers).

It ships in two modes sharing one deterministic simulation core:

1. **Simulation Mode (observer):** Configure a scenario — agency, budget, launch cadence, tech level, "ideal" vs "realistic" failure rates — and watch colonization unfold automatically, with intervention controls. A living model of how lunar settlement could actually happen.
2. **Game Mode (manual):** A base-builder / civilization-style game where the player manages everything: landings, power, life support, ISRU production chains, crew health, crises, and progression through the phases of colonization.

**Strategy:** Web-first (TypeScript, free, GitHub Pages / itch.io), open source from day one, with a later port of the proven simulation core to Godot 4 for a Steam release.

---

## 2. Goals & Non-Goals

### Goals

- G1: A deterministic, scientifically-grounded lunar colony simulation core, reusable across web and game-engine frontends.
- G2: A playable, fun base-builder despite hard realism (via time compression, legible failure, layered complexity).
- G3: Two modes (observer simulation + manual game) on one shared core.
- G4: Zero-cost hosting and distribution for v1 (static web build).
- G5: An open-source project structured to allow a future commercial Steam release (license + CLA decided before first external contribution).
- G6: Educational value: tooltips and encyclopedia entries cite real data and missions.

### Non-Goals (v1)

- Multiplayer.
- 3D rendering (v1 is 2D top-down; 3D deferred to the Godot port).
- Mars or asteroid content (design leaves hooks; not in scope).
- Photorealism or heavy asset production.
- Mobile-native apps (responsive web is sufficient).

---

## 3. Users & Personas

| Persona                  | Description                         | Needs                                                     |
| ------------------------ | ----------------------------------- | --------------------------------------------------------- |
| **The Strategist**       | Plays Factorio, Surviving Mars, ONI | Deep production chains, optimization, crisis management   |
| **The Space Nerd**       | Follows Artemis/SpaceX news         | Accuracy, real missions/hardware, "what-if" scenario play |
| **The Educator/Student** | Teaching or learning space science  | Simulation mode, real constants, encyclopedia             |
| **The Contributor**      | Open-source dev/modder              | Clean architecture, data-driven JSON content, docs        |

---

## 4. Product Pillars

1. **Real physics or it doesn't ship.** Gravity 1.62 m/s², 29.5-day lunar day, real radiation doses, real ISRU yields, real delta-v budgets. Numbers are tunable constants but defaults are sourced.
2. **One deterministic core, two experiences.** Simulation mode and game mode are the same systems; only the decision-maker differs (AI/script vs player).
3. **Failure is content.** Solar storms, lander tip-overs, dust degradation, budget cuts — realistic hazards drive the drama, with clear cause→effect.
4. **Open and moddable.** All content (buildings, resources, reactions, tech, events) defined in JSON; sim-core has no DOM/engine dependencies.

---

## 5. Functional Requirements

### 5.1 Simulation Core (sim-core)

- FR-1: Fixed-timestep tick loop. 1 tick = 1 game-hour (baseline). Deterministic given (seed, config, input log).
- FR-2: Entity-Component-System world model; serializable to versioned JSON saves.
- FR-3: Mass & energy conservation invariants enforced (no resource from nothing); violations fail tests.
- FR-4: Systems (each a pure tick function over the ECS world):
  - Environment: lunar day/night cycle, surface temperature, illumination per site, SPE/GCR radiation.
  - Power: generation (solar, fission, RTG, fuel cells), storage, distribution, brownout priority.
  - Thermal: heat generation, radiator rejection, night survival heating.
  - ECLSS: O₂, CO₂ (incl. Sabatier), water recycling loop with closure %, food consumption.
  - ISRU: reaction processors (MRE, ilmenite reduction, ice mining, electrolysis, Sabatier, regolith printing).
  - Construction: build queues, regolith works (pads, berms, printed structures).
  - Crew: health (radiation dose accumulation, bone/muscle drift, morale), tasks, EVA, medical events.
  - Logistics: Earth resupply missions (delta-v/cost model, launch windows, failure probability), surface transport.
  - Tech/Research: tech-tree progression gated by phase and science output.
  - Events: stochastic hazard engine driven by per-mode probability tables.
  - Economy: budget, costs, exports (propellant, He-3, metals) in later phases.
- FR-5: Phase progression engine (Phases 0–6) with transition criteria and milestone tracking.

### 5.2 Game Mode

- FR-6: Top-down 2D base view on a tile/grid map of a south-pole region (Shackleton rim site default) with illumination & ice-deposit overlays.
- FR-7: Build/demolish placement with prerequisites (power, tech, crew, materials).
- FR-8: Time controls: pause, 1×, fast (1 tick/s and faster), auto-pause on critical alerts.
- FR-9: Crisis/alert queue with cause explanation and suggested responses.
- FR-10: Tech tree UI; research allocation.
- FR-11: Crew roster: health, radiation dose, role, morale.
- FR-12: Resupply planner: schedule launches (vehicle, payload, cost, ETA, risk).
- FR-13: Win/lose: lose on full crew loss or budget collapse (configurable); milestones per phase; sandbox endless mode.

### 5.3 Simulation Mode

- FR-14: Scenario config screen exposing: agency (NASA / China-ILRS / Commercial / Custom), budget profile, launch cadence, starting tech level, ideal-vs-realistic failure tables, time horizon.
- FR-15: Auto-policy AI that makes the same decisions a player would (build orders, resupply, research) via a scripted/heuristic policy defined in data.
- FR-16: Observer dashboard: timeline of milestones, charts (population, power, closure %, budget), event log.
- FR-17: Intervention toggle: pause and take manual control at any time (converts to game mode mid-run).
- FR-18: Preset scenarios shipped: "Artemis Baseline (2026 plan)", "Ideal Trajectory", "Realistic Trajectory (historical failure rates)", "ILRS Race", "Commercial Bootstrap".

### 5.4 Platform & Distribution

- FR-19: Static web build deployable to GitHub Pages/itch.io/Cloudflare Pages; no server required; saves in localStorage + file export/import. _(Note: localStorage is fine in our own deployed site; the in-chat preview build must use in-memory saves.)_
- FR-20: Runs at 60 fps render / ≥20 ticks/s fast-forward for a 200-entity colony on a mid-range laptop; sim runs in a Web Worker.
- FR-21: Mod loading: external JSON definition packs override/extend base data.

---

## 6. Non-Functional Requirements

- NFR-1 Determinism: identical (seed, config, inputs) ⇒ identical world hash after N ticks (CI-enforced golden tests).
- NFR-2 Performance budget: sim tick ≤ 8 ms at 500 entities; save ≤ 2 MB typical.
- NFR-3 Accessibility: keyboard navigation, colorblind-safe resource palette, scalable UI text.
- NFR-4 Code quality: TypeScript strict mode; ≥80% unit coverage on sim-core; ESLint + Prettier.
- NFR-5 Licensing: code MIT (or Apache-2.0); art/assets separately licensed; CLA required for contributions.
- NFR-6 Documentation: every system has a doc section mapping formulas → source.

---

## 7. Phase/Era Content Requirements (summary; full spec in docs/PHASES.md)

| Phase | Name                       | Pop          | Power       | Key unlocks                                           | Transition criterion                       |
| ----- | -------------------------- | ------------ | ----------- | ----------------------------------------------------- | ------------------------------------------ |
| 0     | Robotic Precursors         | 0            | kW          | CLPS landers, prospecting, relay comms                | Ice deposit mapped + 2 successful landings |
| 1     | Crewed Sorties             | 2–4 (days)   | 10s kW      | Crewed lander, EVA, storm-shelter protocol            | 1 crewed sortie survives full stay         |
| 2     | Outpost                    | 4–8 rotating | ~40 kWe     | Foundation hab, fission power, LTV, pressurized rover | Survive a full lunar night crewed          |
| 3     | Permanent Base + ISRU      | 10s–100s     | 100s kW–MW  | MRE O₂, ice→propellant, regolith printing             | ≥50% O₂ & water from local sources         |
| 4     | Self-Sustaining Settlement | 100s–1000s   | MW          | Closed-loop food, local manufacturing, first births   | ≥90% mass closure + parts self-made        |
| 5     | Industrial Export          | 1000s        | 10s–100s MW | Mass driver, He-3 & propellant export, space solar    | Net-positive export economy                |
| 6     | Lunar City & Beyond        | 10k+         | 100s MW+    | Domed/paraterraformed craters, autonomy               | Sandbox/endgame (speculative, flagged)     |

---

## 8. Key Simulation Constants (defaults; full table in docs/SDD.md)

- Gravity 1.62 m/s²; lunar day 29.53 Earth days; surface temp +127 °C day / −173 °C night; PSR ~25–40 K.
- Crew consumables per person-day: O₂ 0.84 kg, water 3.54 kg (potable; ~2× with hygiene), food 0.62 kg dry; CO₂ out 1.00 kg.
- ECLSS water recovery 90–98% (tech-upgradable); Sabatier: CO₂ + 4H₂ → CH₄ + 2H₂O.
- MRE oxygen: ~1 t O₂/yr per ~400 kg, 14 kW plant (highlands); energy 26–40+ kWh/kg O₂ (tunable range).
- Propellant: LOX production ≈ 11.3 kWh/kg all-in (mining→cryo).
- Fission Surface Power: 40 kWe, 10-yr life, ≤6,000 kg unit.
- Radiation: ~0.5 mSv/day unshielded; SPE shelter ≥10 g/cm² regolith; 30-day limit 250 mSv.
- Delta-v: TLI 3.15 km/s; LOI ~0.9–1.1 km/s; descent ~1.9 km/s; one-way comms delay 1.28 s.
- Food: 40–50 m² crop area per person for full diet.

---

## 9. Success Metrics

- M1: MVP playable in browser; a new player survives the first lunar night within 3 attempts.
- M2: Determinism CI green for 90 consecutive days.
- M3: 500+ GitHub stars or 5+ external contributors within 6 months of public launch (signal for Stage 3 Steam port).
- M4: Simulation mode "Realistic Trajectory" reproduces plausible Artemis-like timelines (face validity review).

---

## 10. Risks

| Risk                                 | Mitigation                                                   |
| ------------------------------------ | ------------------------------------------------------------ |
| Realism overwhelms fun               | Layered onboarding; difficulty presets; auto-pause; tooltips |
| Scope creep (7 phases)               | MVP = Phase 2 only; phases gated by roadmap                  |
| Web perf for big colonies            | Web Worker sim; entity caps; accelerate Godot port           |
| Relicensing blocked by contributions | CLA from day one; MIT code / separate asset license          |
| 2026 space facts go stale            | All real-world data in JSON with `source` + `as_of` fields   |

---

## 11. Release Plan

- **v0.1 MVP (Stage 1):** Phase 2 outpost playable; web deploy. → See TASKS.md M1–M4.
- **v0.5 Vertical Slice (Stage 2):** Phases 0–3, two modes, full hazard set.
- **v1.0 (Stage 3):** Phases 0–6, scenario presets, polish, mod support.
- **v2.0 Steam (Stage 4):** Godot 4 port of sim-core; paid Steam build; web stays free.

---

## 12. Document Map

| File                  | Purpose                                       |
| --------------------- | --------------------------------------------- |
| PRD.md                | This document                                 |
| TASKS.md              | Phased engineering task list for Claude Code  |
| CLAUDE.md             | Repo rules for Claude Code                    |
| docs/GDD.md           | Game design (loop, fun, onboarding)           |
| docs/SDD.md           | Simulation models, formulas, constants tables |
| docs/TAD.md           | Technical architecture                        |
| docs/PHASES.md        | Era progression spec                          |
| docs/ECONOMY.md       | Resources & production chains                 |
| docs/BUILDINGS.md     | Building/module catalog                       |
| docs/TECH-TREE.md     | Research tree spec                            |
| docs/EVENTS.md        | Hazards & events spec                         |
| docs/MODES.md         | Two-mode & scenario spec                      |
| docs/UI-UX.md         | Wireframe descriptions                        |
| docs/ART-DIRECTION.md | Visual style                                  |
| docs/ROADMAP.md       | Milestones & thresholds                       |
| docs/DATA-SCHEMA.md   | JSON content schemas                          |
| CONTRIBUTING.md       | OSS workflow + CLA                            |
| README.md             | Public-facing overview                        |
