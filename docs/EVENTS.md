# EVENTS.md — Hazards & Events Spec

Stochastic engine: each event has `baseRatePerYear` (Ideal/Realistic columns), trigger conditions, effects, warning lead, player responses, and encyclopedia ref. Drawn deterministically from world RNG.

## Environmental

| Event                              | Ideal         | Realistic | Effects / counterplay                                                          |
| ---------------------------------- | ------------- | --------- | ------------------------------------------------------------------------------ |
| Solar Particle Event (minor)       | 4/yr          | 6/yr      | +10–50 mSv unsheltered; warning 12–48 t; response: shelter order               |
| SPE (major, Carrington-class rare) | 0.3/yr        | 0.5/yr    | 100–500 mSv unsheltered; electronics glitch rolls; shelter ≥10 g/cm² → ≤10 mSv |
| Micrometeorite strike              | 0.5/yr/colony | 1/yr      | random building damage 1–10%; berms/burial −80%                                |
| Moonquake (shallow)                | 0.2/yr        | 0.3/yr    | structural stress check; printed/rigid structures pass, inflatables risk leak  |
| Dust storm? — none (no atmosphere) | —             | —         | (anti-event: encyclopedia notes why, vs Mars fiction)                          |
| Dust accumulation (continuous)     | rate×1        | ×1.5      | solar −0.5%/EVA-heavy day; seals wear; pads/EDS/airlock tech mitigate          |
| Eclipse (Earth shadow)             | 2/yr          | 2/yr      | scheduled: 6 h darkness even on lit ridge; battery check                       |

## Technical

| Event                   | Ideal  | Realistic | Notes                                                                |
| ----------------------- | ------ | --------- | -------------------------------------------------------------------- |
| Equipment failure       | MTBF×1 | MTBF×0.67 | per-building wearRate; consumes spare parts; cascading if unrepaired |
| ECLSS component failure | 0.5/yr | 1/yr      | scrubber/OGA offline; grace window then health cascade               |
| Cryo boiloff excursion  | 0.3/yr | 0.6/yr    | lose 5–15% of a tank                                                 |
| Software/comm outage    | 0.5/yr | 1/yr      | automation floor drops 24 t                                          |
| Fission scram           | 0.1/yr | 0.2/yr    | 40 kWe offline 24–72 t; the night-timing nightmare                   |

## Logistics & program (Realistic-weighted)

| Event                    | Ideal | Realistic                   | Notes                                                              |
| ------------------------ | ----- | --------------------------- | ------------------------------------------------------------------ |
| Launch failure (robotic) | 5%    | 50%→15% w/ tech             | per mission                                                        |
| Launch failure (crew)    | 1%    | 3% scrub-biased; 0.3% fatal | abort saves                                                        |
| Launch vehicle pad loss  | —     | 0.1/yr                      | modeled on New Glenn 2026: a vehicle class unavailable 6–18 months |
| Resupply slip            | —     | 20%/mission +2–6 wk         | compounding pressure                                               |
| Budget cut / boost       | —     | deck                        | ±10–30% appropriation                                              |
| Program restructuring    | —     | 0.05/yr                     | e.g., Gateway-2026-style: refund + lose a tech branch option       |

## Human

| Event             | Ideal          | Realistic | Notes                                                                                                      |
| ----------------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Medical emergency | 0.5/yr/10 crew | 1/yr/10   | severity roll vs clinic tier; worst case evac or death                                                     |
| Morale crisis     | low            | med       | triggered by crowding/night/crisis streaks; rec/comms counter                                              |
| EVA accident      | 0.2/yr         | 0.4/yr    | suit puncture mini-crisis (consumables timer)                                                              |
| First birth (arc) | —              | —         | Phase 4 milestone chain; requires partial_g_countermeasures + Medical Center; ethics flavor handled gently |

## Positive/flavor

Science windfall · Earth media moment (+budget) · International partner module offer · Tourist charter (Phase 4+) · He-3 demand spike (quantum-computing contract) · Rival program milestone (ILRS ticker pressure)

## Design rules

1. Every negative event names its cause chain and ≥1 counterplay in the alert.
2. No unsurvivable instant-loss events; worst cases give a timer.
3. Realistic decks reference real incidents in encyclopedia entries (Peregrine, IM-1 tip-over, Biosphere 2, New Glenn pad loss) — education through failure.
