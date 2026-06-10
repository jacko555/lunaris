# MODES.md — Two-Mode & Scenario Spec

One deterministic sim-core, two front-of-house experiences. The ONLY difference between modes is who issues commands (Policy AI vs player) and which UI shell is shown.

## 1. Game Mode (manual)

Standard base-builder flow. Player issues `Cmd*` via UI. All systems per SDD. Difficulty preset selects parameter table (Story / Realistic / Hardcore).

## 2. Simulation Mode (observer)

### 2.1 Scenario config schema (data/scenarios/\*.json)

```jsonc
{
  "id": "realistic_trajectory",
  "name": "Realistic Trajectory (2026–2050)",
  "agency": "nasa", // nasa | ilrs | commercial | custom
  "startYear": 2026,
  "horizonYears": 25,
  "budgetProfile": { "annualUSD": 7.0e9, "volatility": "realistic" },
  "launchCadence": { "roboticPerYear": 4, "crewPerYear": 1 },
  "startTechs": ["eclss_baseline", "precision_landing"],
  "failureTables": "realistic", // ideal | realistic | custom overrides
  "site": "shackleton_rim",
  "policyAI": "balanced", // cautious | balanced | aggressive | isru_first | custom weights
  "autopause": ["phase_transition", "crew_death"],
  "seed": null, // null = random, else reproducible
}
```

### 2.2 Policy AI (in sim-core)

Heuristic agent evaluated each game-day:

1. Safety pass: shelter orders on SPE warning; power-night readiness check (projected night balance < 0 → buy storage/fission).
2. Needs pass: consumable runway < 2 lunar days → schedule resupply.
3. Growth pass: spend remaining budget by policy weights (`infrastructure / isru / science / population`).
4. Research pass: pick cheapest tech unblocking the next phase criterion.
   Weights per `policyAI` profile in data — moddable. AI uses the same command API and RNG ⇒ runs reproducible.

### 2.3 Observer UI

- Timeline ribbon: milestones with real-anchor labels ("First landing — cf. Artemis IV target 2028").
- Charts (uPlot): population, power gen/use, closure %, cumulative dose, budget, imports kg/mo.
- Event log with cause chains; speed to 1 lunar day/min; jump-to-event.
- Compare runs: load 2 finished runs, overlay charts (Ideal vs Realistic is the hero comparison).

### 2.4 Intervention

`Take Command` pauses, swaps to game-mode UI on the same world; AI can be re-enabled per-domain (e.g., AI handles logistics, player builds) — "advisor toggles".

## 3. Shipped presets

| Preset               | Agency     | Failure                  | Flavor                                                          |
| -------------------- | ---------- | ------------------------ | --------------------------------------------------------------- |
| Artemis Baseline     | NASA       | ideal targets, 2026 plan | SLS yearly cadence, Moon Base phases, no orbital station branch |
| Ideal Trajectory     | NASA       | ideal                    | everything on time — the brochure timeline                      |
| Realistic Trajectory | NASA       | realistic                | historical base rates, slips, pad-loss & restructuring decks    |
| ILRS Race            | ILRS       | realistic                | China/Russia tech list, 2030 crewed target, 2035 basic station  |
| Commercial Bootstrap | commercial | realistic                | low appropriation, propellant-revenue-or-die                    |

## 4. Reproducibility contract

Preset + seed ⇒ identical milestone timeline (golden tests). Scenario results screen exports a shareable JSON (seed+config+milestones) so users can publish "runs".

---

**Implemented notes (M6):** the Policy AI runs daily passes 0-4 (research → safety → needs → growth) inside sim-core, issuing the same serializable commands as a player so observer runs replay deterministically; cmd-set-policy is the Take Command handoff (same world, same tick). Scenario presets live in data/base/scenarios.json and map to world config via scenarioToConfig; weight profiles (cautious/balanced/aggressive/isru*first) are overridable per scenario via policyWeights. The AI provisions consumables for \_incoming* crew parties (an uncrewed base otherwise deadlocks: no food ordered until crew exist, no crew landed until food exists) and scales radiator orders to the base's aggregate waste heat. The rival ticker fires scheduled scenario milestones as flavor alerts.

**Soak-run hardening (post-v1.0):** a 3-year ideal-trajectory soak exposed a chain of colony-killers, fixed in order: (1) the AI never ordered food for a base with zero living crew while refusing to land crew without food — provisioning now targets the incoming party; (2) reactors were only queued reactively when crew were already alive, while settlers were (correctly) refused without built night power — fission is now in the proactive infrastructure want-table, scaled to ~80% of installed demand after a single 40 kW unit froze a 25-building base mid-night; (3) the machine-components reorder floor (3 t) sat below the fission build cost (6 t), deadlocking the site — the floor now covers unpaid sites; (4) settler parties now land two days behind their supply lander instead of waiting for a stock check that a propellant plant kept draining; (5) survival shipments use a \.1B floor instead of the \ growth reserve and are clamped to one heavy-lander payload (a 48-person water order silently overflowed it). Result: stable growth to 48 settlers/Phase 3 in 3 years with zero wipes.
