# PHASES.md — Era Progression Spec

Phases 0–6 structure both modes. Each phase defines: starting conditions, available content, transition criteria, ideal vs realistic parameters, and failure modes. Real-world anchors are flavor + simulation-mode preset data.

---

## Phase 0 — Robotic Precursors & Prospecting

**Real anchor:** CLPS era 2024–2028 (Peregrine failure, IM-1 tipped, IM-2 sideways, Blue Ghost M1 full success; up to 30 CLPS landings planned from 2027).

- Player actions: select landing sites, buy robotic missions (prospector rover, ice mapper, comms relay, nav beacon, demo ISRU), manage budget.
- Map effect: ice-concentration overlay starts hidden/uncertain (shown as probability bands); each prospecting mission tightens uncertainty on surveyed tiles.
- Parameters: Ideal landing success 0.95; Realistic 0.50 improving to 0.85 with `precision_landing` tech (matches historical base rate).
- **Transition →1:** ≥2 successful landings AND one ice deposit characterized (uncertainty < ±1 wt%) AND comms relay active.
- Failure modes: budget burn with repeated failures (lose condition only if budget collapses).

## Phase 1 — Crewed Sorties

**Real anchor:** Artemis IV-style landing (~2028 target), Apollo heritage; China crewed landing 2029–30 in ILRS scenario.

- New content: crewed lander (4 seats, 6.5-day surface stay default), EVA suit consumables, portable shelter, sample science (science points), flag-and-footprints milestone.
- Mechanics introduced: crew entities (lite — dose + consumables only), SPE risk during sortie (shelter-in-lander rule), abort logic.
- Parameters: Ideal crewed-landing success 0.99; Realistic 0.97 with abort saves (failure usually = scrub/abort, rarely fatal; fatal p 0.003 Realistic).
- **Transition →2:** 2 sorties completed AND `surface_power_40kw` + `foundation_hab` techs researched AND budget ≥ outpost cost.

## Phase 2 — Outpost (rotating crews) ★ MVP scope

**Real anchor:** NASA Moon Base Phase 1–2 ("Build, Test, Learn" → "Early Infrastructure"): foundation habitat, JAXA pressurized rover, LTV, fission surface power, CLPS cargo.

- Crew 4–8, rotations every 60–180 days. Full ECLSS, power/thermal, dust, hazard engine active.
- The boss fight: first crewed lunar night. Pre-fission, night survival = RFC stack + RTG keep-alive + reduced crew, or evacuate-and-return cadence.
- Parameters: resupply cadence Ideal monthly / Realistic 6–10 weeks with 5% slip-compounding; fission delivery date Ideal day 1 / Realistic gated by a "program risk" event deck (e.g., launch vehicle pad loss event modeled on New Glenn 2026).
- **Transition →3:** survive one full lunar night crewed AND continuous occupation ≥ 6 months AND first ISRU demo (any local O₂ or water produced).
- Failure modes: night power death spiral, SPE with no shelter, dust-induced solar decay, ECLSS spare shortages.

## Phase 3 — Permanent Base + ISRU

**Real anchor:** NASA Moon Base Phase 3 (long-duration presence, ASI habs, CSA utility vehicle), 2030s ISRU pilot plants, propellant economy thesis.

- Population 10s→100s (specialists). Full ISRU chains: ice→water→propellant; MRE O₂+metals; regolith printing (berms, pads, hab shells); Sabatier loop closure.
- Economy turns on: propellant sales to visiting missions (revenue), $/kg import cost pressure creates the make-vs-buy game.
- Power scaling: multiple fission units → MW; the sim should make MW-scale power a felt prerequisite for propellant export (validation target SDD §11).
- **Transition →4:** closure% ≥ 50% for consumables AND local production ≥50% of O₂+water AND population ≥ 50 AND spare-parts workshop online.
- Failure modes: ISRU equipment wear vs spares, single-point power dependence, dose accumulation forcing rotation churn, budget if import-heavy.

## Phase 4 — Self-Sustaining Settlement

**Real anchor:** speculative but engineering-grounded; Antarctic-station → town transition. Genetic/social viability literature: founding populations from ~160 (managed) to thousands — surfaced in-game as a policy slider, not a single truth.

- New systems: food production at scale (45 m²/person hydroponics), demographics (immigration waves, first births event chain, children = non-workers), housing/recreation needs, local manufacturing tree (metals→parts→machines), medical self-sufficiency.
- Closure target ≥90%; Earth imports become luxuries/complex electronics only.
- **Transition →5:** closure ≥90% AND population ≥ 500 AND export infrastructure tech researched.
- Failure modes: closed-loop ecology instability (Biosphere-2-style O₂/CO₂ drift events), social morale collapse, medical catastrophe without evac capacity.

## Phase 5 — Industrial Export Economy

**Real anchor:** propellant depots, Interlune-style He-3 (flagged: near-term demand is cryogenics, ~$20M/kg, small market; fusion speculative), PGMs, space solar power.

- Megaprojects: mass driver (electromagnetic launch — MW-class draw, exports without propellant), depot in orbit, He-3 volatile combines processing 100 t regolith/hr class, beamed-power pilot.
- Macro layer: commodity prices with elasticity (flooding the He-3 market crashes it), contracts with Earth agencies & Mars program.
- **Transition →6:** sustained net-positive export economy for 5 years AND population ≥ 2,000.
- Failure modes: market crashes, megaproject cost overruns, dependence on one export.

## Phase 6 — Lunar City & Beyond (sandbox, flagged speculative)

- Content: domed/paraterraformed crater megaproject, lava-tube city expansion, autonomy/independence referendum event arc (Accords-flavored politics), gateway-to-solar-system missions (fuel Mars fleets).
- No fail state; prestige goals + endless sandbox.

---

## Cross-phase systems table

| System          | P0     | P1     | P2     | P3     | P4     | P5  | P6  |
| --------------- | ------ | ------ | ------ | ------ | ------ | --- | --- |
| Budget/launches | ●      | ●      | ●      | ●      | ◐      | ●   | ◐   |
| Crew/ECLSS      | –      | lite   | ●      | ●      | ●      | ●   | ●   |
| ISRU chains     | demo   | –      | demo   | ●      | ●      | ●   | ●   |
| Food production | –      | –      | –      | ◐      | ●      | ●   | ●   |
| Demographics    | –      | –      | –      | –      | ●      | ●   | ●   |
| Export economy  | –      | –      | –      | ◐      | ◐      | ●   | ●   |
| Politics/intl   | ticker | ticker | ticker | events | events | ●   | ●   |

## Ideal vs Realistic parameter philosophy

Every phase carries two probability/cost tables in `data/scenarios/`. Ideal = published program targets. Realistic = historical base rates + documented slips (CLPS 50% early success, multi-year program slips, pad-loss events, budget restructurings like the 2026 Gateway cancellation — which appears as a possible "program restructuring" event that refunds budget but removes an orbital-station tech branch).
