# GDD.md — Game Design Document

## 1. Concept

LUNARIS: build humanity's foothold on the Moon, for real. A top-down hard-realism colony builder spanning the eras of lunar colonization (robotic precursors → lunar city), plus an observer simulation mode that plays scenarios out automatically.

**Player fantasy:** "I am the program director and base commander of the real lunar settlement effort."

## 2. Pillars

1. Real physics or it doesn't ship.
2. One deterministic core, two experiences (sim/game).
3. Failure is content — crises are legible, survivable, and educational.
4. Open and moddable.

## 3. Core Loop (game mode)

Prospect site → land hardware → balance power & life support → stand up ISRU chains → grow crew/population → research → survive crises (the lunar night, solar storms, failures) → hit phase milestone → unlock next era. Loop period: ~1 lunar day (≈12–20 min at default speed).

**Micro-loop tension:** every 14-day night is a survival exam; every SPE is a fire drill; every resupply is a bet.

## 4. Time Design (the 29.5-day problem)

- 1 tick = 1 hour. Speeds: pause / 1×(2 ticks/s) / 4× / 16× / "skip to event".
- Auto-pause defaults: SPE warning, Tier-0 power shed, crew health critical, landing arrival, milestone.
- Calendar UI shows lunar phase prominently — players plan around night like farmers around winter.

## 5. Difficulty & Onboarding

- Modes: Story (forgiving consumable margins, +50%), Realistic (defaults), Hardcore (permadeath colony, realistic failure tables).
- Tutorial = "First Night": scripted Phase-2 mini-scenario teaching power → ECLSS → shelter → ISRU water in ~30 min.
- Layered complexity: Phase 0–1 expose only landings/budget; ECLSS appears in Phase 2; chains in Phase 3; demographics in Phase 4; macro-economy in Phase 5.
- Every alert names cause and points to the fix ("Scrubber offline ← Tier-0 power deficit ← night + battery empty. Options: fission, RFC, reduce crew.").

## 6. Win/Lose & Replayability

- Campaign win: reach Phase 4 ("self-sustaining") under scenario constraints; extended goals Phase 5/6.
- Lose: all crew dead/evacuated, or budget < 0 for 2 consecutive quarters (configurable).
- Replay: site choice (rim vs PSR-adjacent vs lava tube vs mare-ilmenite), agency flavor, mode, seeds.

## 7. Emotional beats

Apollo-era awe (first landing cinematic text), Antarctic loneliness (night, comm delay flavor), Factorio satisfaction (chain completion), disaster-movie spikes (SPE klaxon), civilization pride (first birth, independence question).

## 8. Educational layer

"Lunarpedia": every building/resource/event has an entry with the real mission/figure behind it and `source`. Tooltips show real units. Simulation mode doubles as a classroom tool.

## 9. Out of scope v1

Multiplayer, 3D, Mars, combat. The international layer is a progress ticker + events, not a wargame.
